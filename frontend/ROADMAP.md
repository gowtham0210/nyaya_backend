# Nyaya Admin Portal — Development Roadmap

> Strategic plan to evolve the current **Nyaya Admin Studio** (`frontend/`) from a single-page developer tool into a professional, end-to-end management portal for non-technical content managers.

---

## 0. Current State Snapshot

| Area | Today (`frontend/src/App.jsx`, `api.js`) | Gap |
|---|---|---|
| Auth | Email login **or** manual paste of `accessToken`; tokens saved in plain `localStorage`; no refresh handling | No silent refresh, no logout API call, no HttpOnly persistence, manual-token flow is a developer affordance |
| Networking | Hand-rolled `apiRequest()` using `fetch`; every call passes `baseUrl + accessToken` | No interceptors, no retry/refresh, no caching, no request de-duplication |
| State | Raw `useState` for `categories`, `quizzes`, `questions`, `optionDrafts`; manual re-fetch after every mutation | Prop-drilling, stale data, race conditions, scattered error handling |
| UX | Single `app-shell` with stacked "Step 1/2/3" panels; `window.confirm` dialogs; no navigation | No room for Users, Attempts, Levels, Leaderboards, Dashboard |
| Bulk Upload | Raw JSON textarea, sequential `POST`s in a `for` loop, binary success/fail banner | No validation, no per-row errors, no CSV/XLSX, no dry-run |
| API coverage | `/auth/*`, `/admin/categories`, `/admin/quizzes`, `/admin/questions`, `/admin/options` | Missing: `/auth/refresh`, `/users/*`, `/quiz-attempts`, `/levels`, `/admin/levels`, `/leaderboards/*` |

---

## 1. Automated Authentication & Session Management

### 1.1 Replace Manual Token with a Proper Login Flow
- **Retire** the `Manual token` card in `App.jsx` (lines ~1207–1228). Keep it only behind a `?devMode=1` query flag for internal QA.
- **Introduce a dedicated `/login` route** (see §2.1) guarded by a public layout; all other routes require an authenticated session.
- **Post-login contract**: store `{ accessToken, refreshToken, user, role, expiresAt }` in an `AuthContext` — never in component state scattered across `App.jsx`.
- **Role gate**: non-`admin` users land on a read-only "Access denied" screen; the existing ad-hoc banner (`App.jsx` L404) is insufficient.

### 1.2 Automatic Token Management (Axios + Interceptors)
Migrate `src/api.js` from `fetch` to an **Axios** instance (`src/lib/httpClient.js`) with two interceptors:

1. **Request interceptor** — attaches `Authorization: Bearer <accessToken>` from `AuthContext`; also injects an `X-Request-Id` for traceability.
2. **Response interceptor** — on `401 Unauthorized`:
   - Queue the failed request.
   - Call `POST /auth/refresh` **once** (single-flight lock to avoid refresh storms when N requests 401 in parallel).
   - On success → update tokens, replay queued requests.
   - On failure → clear session, redirect to `/login` with a `?reason=session_expired` query.
3. **Proactive refresh** — a `useEffect` in `AuthProvider` decodes the JWT `exp` (reuse `decodeJwtPayload` from `api.js`) and schedules a refresh **60 seconds before expiry**, so the user never sees a 401 during normal use.

### 1.3 Secure Session Persistence
Two-tier strategy depending on backend capability:

| Tier | Storage | When |
|---|---|---|
| **Preferred** | `refreshToken` in **HttpOnly + Secure + SameSite=Strict cookie** issued by the API; `accessToken` in memory only | Requires backend to set the cookie on `/auth/login` and read it on `/auth/refresh`. Best defense against XSS token theft. |
| **Fallback** | `refreshToken` in `localStorage` **encrypted** via Web Crypto (AES-GCM) with a per-install key in `IndexedDB`; `accessToken` in memory | Use only if the cookie path is not available; document the XSS risk in the security README. |

- Remove the current `nyaya-admin-session` localStorage blob that contains the raw `accessToken` (`App.jsx` L14, L343).
- On browser refresh, `AuthProvider` boots by calling `/auth/refresh` (cookie-based) **or** decrypting the stored refresh token, then hydrating the user via `/auth/me`.
- Add an explicit **Logout** action that calls `POST /auth/logout` (currently unused) before clearing client state.

### 1.4 Deliverables
- `src/context/AuthContext.jsx` — provider, `useAuth()` hook, `RequireAuth` + `RequireAdmin` route guards.
- `src/lib/httpClient.js` — Axios instance with interceptors and single-flight refresh.
- `src/lib/secureStorage.js` — encrypt/decrypt helpers (fallback tier only).
- `src/pages/Login.jsx`, `src/pages/SessionExpired.jsx`.

---

## 2. UX for Non-Technical Users

### 2.1 Sidebar-Based Shell
Replace the single `app-shell` in `App.jsx` (L1130) with a persistent two-pane layout:

```
┌─────────────┬────────────────────────────────────────┐
│  Sidebar    │  Topbar (breadcrumbs · search · user)  │
│  (nav)      ├────────────────────────────────────────┤
│             │                                        │
│  Dashboard  │            Route outlet                │
│  Content ▾  │                                        │
│  Gamify  ▾  │                                        │
│  Users   ▾  │                                        │
│  Attempts   │                                        │
│  Settings   │                                        │
└─────────────┴────────────────────────────────────────┘
```

- **Routing**: adopt `react-router-dom` v6. Top-level routes: `/dashboard`, `/content/categories`, `/content/quizzes`, `/content/questions`, `/gamification/levels`, `/gamification/leaderboards`, `/users`, `/attempts`, `/settings`.
- **Component library**: standardize on **shadcn/ui + Tailwind** (or Mantine) to replace hand-written classes in `styles.css`. Gives non-technical users familiar affordances: toasts, modals, data tables, tooltips.
- **Feedback**: replace `window.confirm` (used in `handleCategoryDelete`, `handleQuizDelete`, `handleQuestionDelete`, `handleOptionDelete`) with a typed `<ConfirmDialog/>`; replace `StatusBanner` with a `toast` queue.

### 2.2 Dashboard View (`/dashboard`)
First screen after login. Composed of KPI cards + recent-activity feed, all fed from existing endpoints:

| Widget | Source | Notes |
|---|---|---|
| Total active Categories / Quizzes / Questions | `GET /admin/categories`, `/admin/quizzes`, aggregate | Replaces the three hero stat cards currently at `App.jsx` L1140 |
| Active users (7d / 30d) | `GET /users/...` aggregate (extend API if needed) | Derived metric |
| Quiz attempts today | `GET /quiz-attempts?status=submitted&from=today` | New endpoint usage |
| Top 5 quizzes by attempts | Aggregate of `/quiz-attempts` | Table with drill-down |
| Global leaderboard (top 10) | `GET /leaderboards/global?limit=10` | Read-only preview |
| Recent activity feed | Merge of latest attempts + newest questions | Virtualized list |

### 2.3 Bulk Upload — From Raw JSON to Guided Import
The current flow (`App.jsx` L1051) parses a textarea then loops `POST`s; any single failure aborts the batch. Replace with a **4-step wizard**:

1. **Upload** — accept `.csv`, `.xlsx`, or `.json`. Parse client-side (`papaparse` for CSV, `xlsx` for Excel).
2. **Map columns** — drag-and-drop UI binding source columns → target fields (`questionText`, `questionType`, `explanation`, `difficulty`, `pointsReward`, `negativePoints`, `displayOrder`, `options[n].optionText`, `options[n].isCorrect`). Remember mappings per quiz.
3. **Validate (dry-run)** — run Zod schema (see §4.2) row-by-row; show a table with ✅ / ⚠️ / ❌ per row, inline error messages, and an "Only import valid rows" toggle.
4. **Import** — batched `POST` with a progress bar, per-row status, pause/resume, and a downloadable **error report CSV** for rejected rows. Use `Promise.allSettled` with a concurrency limiter (e.g. 4 parallel) instead of the serial `for` loop.

Provide a downloadable **template file** (CSV + JSON) and an in-app **sample preview** so managers never need to read the OpenAPI schema.

---

## 3. Functional Module Breakdown

### 3.1 Content Management
Unified pattern across Categories, Quizzes, Questions: **List view (data table) → Detail/Edit drawer → Confirm delete**.

**Categories** (`/content/categories`)
- Data table columns: Name · Slug · # Quizzes · Active · Updated At · Actions.
- Server-driven pagination, search by `name`/`slug`, filter by `isActive`.
- Create/Edit in a right-side `<Sheet>` with Zod-validated form.
- Soft-delete (existing `DELETE /admin/categories/{id}` already deactivates) with a "Show inactive" toggle.

**Quizzes** (`/content/quizzes`)
- Columns: Title · Category · Difficulty · # Questions · Passing Score · Time Limit · Active.
- Category filter chip in the toolbar (replaces the implicit "select a category first" UX at `App.jsx` L1438).
- **Auto question-count sync** is already present (`syncQuestionCount`, L527); surface it as a silent background reconciliation instead of the current manual "Sync count" button (L1491).

**Questions** (`/content/questions` and nested `/content/quizzes/:id/questions`)
- Columns: Order · Question · Type · Difficulty · Points · # Options · Active.
- Inline reorder via drag-and-drop → `PATCH /admin/questions/{id}` with new `displayOrder`.
- **Rich-text explanation**: integrate **TipTap** (headings, bold/italic, lists, inline code, links). Persist as HTML in the existing `explanation` field; sanitize with DOMPurify on render.
- **Image upload placeholders**: add an `imageUrl` field to the form today stored as a URL string; ship a `<FileUpload/>` component that currently POSTs to a stub `/admin/uploads` (to be implemented server-side — flagged as dependency). Show a "Coming soon" badge until the upload endpoint exists.
- **Options editor**: replace the per-question mini-form (`QuestionCard`, L173) with an in-drawer repeater; enforce "at least one correct option for `single_choice`, at least one for `multiple_choice`" before save.

### 3.2 Gamification & Levels
New top-level section, uses endpoints currently **unused** by the frontend.

**Levels** (`/gamification/levels`)
- CRUD against `POST /admin/levels` and `PATCH /admin/levels/{levelId}`.
- List view with columns: Level # · Name · Min Points · Max Points · Badge · Perks.
- Visual "ladder" preview component that renders the thresholds as a horizontal timeline so managers can see gaps/overlaps before saving.
- Read `GET /levels` to validate no threshold collisions client-side.

**Leaderboards** (`/gamification/leaderboards`)
- Read-only tabs: **Global** (`/leaderboards/global`), **Weekly** (`/leaderboards/weekly`), **By Category** (`/leaderboards/category/{categoryId}`).
- `Limit` selector (10/25/50/100) bound to the `Limit` query parameter.
- Export-to-CSV button for the current view.

### 3.3 User & Progress Tracking
**Quiz Attempts** (`/attempts`)
- Table fed by `GET /quiz-attempts` with `status` filter (`in_progress` / `submitted` / `abandoned`) and date-range filter.
- Row drill-down → `GET /quiz-attempts/{attemptId}` shows per-question breakdown; link into `GET /quiz-attempts/{attemptId}/result` for submitted attempts.

**User Progress** (`/users/:userId`)
- Composite view for a selected user, combining `/users/me/progress`, `/users/me/streak`, `/users/me/achievements`, `/users/me/point-transactions` (scoped to admin-viewed user via a future `/admin/users/{id}/...` mirror — note as backend dependency).
- Widgets: current level + XP bar, streak heatmap, achievements grid, paginated point-transaction ledger.

---

## 4. Technical Architecture

### 4.1 State Management — TanStack Query + Context
The manual `loadCategories` / `loadQuizzes` / `loadQuestions` re-fetch chain in `App.jsx` (L418–L573) should be replaced with **TanStack Query v5**:

- One query key per resource: `['categories']`, `['quizzes', { categoryId }]`, `['questions', { quizId }]`, `['attempts', filters]`, etc.
- Mutations call `queryClient.invalidateQueries(...)` instead of the current imperative `await loadQuizzes(...)` pattern — eliminates the `refreshWorkspace()` helper (L554).
- Enables caching, background refetch, optimistic updates on Create/Edit, and request de-duplication across route changes.
- Keep **`AuthContext`** (§1) as the only React Context; everything else flows through Query.
- For cross-cutting ephemeral UI state (sidebar open/closed, active filters) use **Zustand** (one `uiStore`). Avoid Redux — overkill for this surface.

### 4.2 Form Validation — Zod + React Hook Form
Today, payloads are hand-built in submit handlers (e.g., `handleCategorySubmit` L696, `handleQuizSubmit` L770) with ad-hoc `toNumber`/`toNullableNumber` coercions. Replace with:

- **Zod schemas** co-located per resource in `src/schemas/` (`categorySchema`, `quizSchema`, `questionSchema`, `optionSchema`, `levelSchema`, `bulkQuestionSchema`). Derive TS types via `z.infer<...>`.
- **React Hook Form** with `zodResolver` for every form; disable submit until `formState.isValid`.
- **Server-error projection**: Axios interceptor maps API `{ field, message }` errors from `400` responses back into `setError('field', ...)` so users see inline messages instead of the current toast-only experience.
- **Shared primitives**: reusable `<TextField/>`, `<NumberField/>`, `<SelectField/>`, `<RichTextField/>`, `<ToggleField/>`, `<SlugField/>` (auto-generates from sibling field — replaces the "Generate" buttons at L1268 and L1377).
- **Cross-field rules** enforced in Zod: `passingScore <= totalQuestions * maxPointsReward`, `timeLimitSeconds >= 0 || null`, at least one correct option per question, unique `displayOrder` within a quiz.

### 4.3 Build & Tooling Upgrades
- Add **TypeScript** (incremental — start with new files, keep `.jsx` working via `allowJs`).
- Add **ESLint + Prettier + Husky pre-commit** (not yet configured in `frontend/package.json`).
- Add **Vitest + React Testing Library** with one smoke test per page and contract tests for the Axios interceptor (refresh single-flight, 401 replay).
- Generate an **Axios client from `openAPI_schema.yaml`** using `openapi-typescript` + `openapi-fetch` (or `orval`) so schemas stay in sync with the backend.

---

## 5. Phased Delivery

| Phase | Scope | Exit Criteria |
|---|---|---|
| **P0 — Foundation** (1–2 wks) | Auth refactor (§1), Axios client, router shell, AuthContext, TanStack Query wired | Login → refresh → logout works end-to-end; existing Categories/Quizzes/Questions screens ported behind new shell with no feature loss |
| **P1 — UX Rewrite** (2 wks) | Sidebar layout, Dashboard, toasts/dialogs, Zod + RHF across all forms | Non-technical user can create a Category → Quiz → Question without reading docs |
| **P2 — Bulk Upload 2.0** (1 wk) | CSV/XLSX/JSON wizard, validation, error report | Import of 500-row file succeeds with per-row reporting |
| **P3 — Gamification** (1 wk) | Levels CRUD, Leaderboards viewer | Admin can configure level thresholds and view all three leaderboards |
| **P4 — Users & Attempts** (1–2 wks) | Attempts list/detail, User progress view | Admin can investigate a specific user's activity |
| **P5 — Hardening** (ongoing) | TypeScript coverage, generated API client, tests, a11y audit | ≥ 70% TS, ≥ 60% test coverage, WCAG 2.1 AA on main flows |

---

## 6. Backend Dependencies (to coordinate with API team)

- `POST /auth/refresh` must accept either the HttpOnly cookie or a body-supplied refresh token.
- `POST /auth/logout` should invalidate the refresh token server-side.
- Admin-scoped variants of user endpoints: `/admin/users`, `/admin/users/{id}/progress`, `/admin/users/{id}/attempts` (so the portal isn't limited to `/users/me`).
- File upload endpoint (`POST /admin/uploads` → returns `{ url }`) for question images.
- Bulk endpoint (`POST /admin/questions/bulk`) to replace N sequential round-trips in the importer.
- Attempt filtering parameters: `from`, `to`, `userId`, `quizId` on `GET /quiz-attempts`.

> These are **not blocking** for P0–P2 but should be scheduled before P3/P4.
