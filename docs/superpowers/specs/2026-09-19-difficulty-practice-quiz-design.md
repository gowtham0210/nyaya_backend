# Difficulty-Based Practice Quiz — Design

Date: 2026-09-19
Status: Approved for implementation

## Problem

Today every quiz a user can play is a fixed, admin-authored set of
questions scoped to one category (e.g. "Environmental Law Quiz"). There
is no way to play a short quiz assembled from questions of a chosen
difficulty (easy/medium/hard) drawn across all categories. This feature
adds that as a second, parallel way to start a quiz — "Practice mode" —
without disturbing the existing category-quiz flow.

Two repos are involved:
- Backend + admin panel: `nyaya_backend-main/nyaya_backend-main`
- Mobile app (Flutter): `Nyaya-main/Nyaya-main`

## Scope

In scope:
- Backend schema and API to start and grade a cross-category,
  difficulty-scoped quiz attempt.
- Admin panel: a "Practice" subsection on the Quizzes page to configure,
  per difficulty, how many questions a practice quiz pulls and whether
  that difficulty is enabled.
- Mobile app: a "Practice" subsection in the Quizzes tab (alongside the
  existing Categories view) where a user picks a difficulty and plays.

Out of scope (explicitly deferred, not to be built now):
- Any change to the Home screen. It stays exactly as it is today.
- Any change to category browsing, category detail screens, or existing
  category quizzes and their admin management.
- A dedicated/curated practice-only question pool — practice quizzes
  draw from the same `questions` table as category quizzes, filtered by
  `difficulty_level`.
- Per-user "don't repeat questions I've already seen" tracking. Once a
  difficulty's pool is exhausted within one draw, `ORDER BY RAND()`
  naturally starts reusing older questions on the next attempt; no
  bookkeeping is added for this.

## Current-state constraints (verified against the running DB and code)

- `questions.quiz_id` is `NOT NULL` — every question belongs to exactly
  one quiz today. Practice quizzes must not require reassigning
  questions to a different quiz.
- `quiz_attempts.quiz_id` is `NOT NULL`, and
  `POST /quiz-attempts/:attemptId/answers` (in
  `src/routes/v1/quiz-attempts.js`) validates an answered question with
  `SELECT * FROM questions WHERE id = ? AND quiz_id = ?` against the
  attempt's single `quiz_id`. This is the specific constraint that
  blocks a multi-category attempt today.
- Scoring, streaks, achievements, and leaderboards
  (`src/services/quiz-attempts.js`, `src/services/gamification.js`,
  `src/routes/v1/leaderboards.js`) never reference `quiz_id` directly —
  they operate purely on `quiz_attempts.id` and `question_attempts`.
  This means a `quiz_id`-less attempt gets full scoring parity with no
  changes to that code.
- Active question counts by difficulty at design time: easy = 12,
  medium = 191, hard = 15, spread across 15 quizzes/categories.
- `CategoriesPage` in the Flutter app
  (`lib/features/categories/presentation/categories_page.dart`) is the
  screen internally referred to as "the Quizzes tab" (see its own
  top-of-file comment). This is the screen the mobile-side toggle is
  added to.

## Decisions made during brainstorming

- Practice quiz length: 10 questions, configurable per difficulty by
  the admin (not hardcoded).
- Thin pools (easy/hard): allowed to repeat once exhausted, via plain
  `ORDER BY RAND() LIMIT n` — no extra "seen" tracking.
- Scoring: a practice attempt scores identically to a category attempt
  (same points, same streak/achievement/leaderboard effects).
- Home screen: untouched. This lives only in the Quizzes tab (mobile)
  and the Quizzes page (admin).
- Admin "Practice" subsection is a settings/config screen (question
  count + enabled toggle per difficulty) — not a separate question pool
  to curate, and not itself a quiz-taking UI.
- Mobile "Practice" subsection is where users actually play — a
  segmented "Categories | Practice" toggle below the existing hero card
  on the Quizzes tab, swapping the content below it.

## Design

### Backend — data model

New table `practice_settings`, one row per difficulty, seeded at
migration time:

| column | type | notes |
|---|---|---|
| `difficulty_level` | `varchar(30)` PK | `'easy' \| 'medium' \| 'hard'` |
| `question_count` | `int` | default 10 |
| `is_enabled` | `tinyint(1)` | default 1 |
| `updated_at` | `timestamp` | |

`quiz_attempts.quiz_id` changes from `NOT NULL` to nullable.

New table `quiz_attempt_questions`:

| column | type | notes |
|---|---|---|
| `id` | `bigint unsigned` PK | |
| `quiz_attempt_id` | `bigint unsigned` | FK → `quiz_attempts.id` |
| `question_id` | `bigint unsigned` | FK → `questions.id` |
| `display_order` | `int` | |

Only practice attempts get rows here. Category attempts leave this
table untouched and keep working exactly as they do today (their
question set is implied by `quiz_id`).

### Backend — API

**Admin (requires admin auth, alongside existing `/admin/*` routes):**
- `GET /api/v1/admin/practice-settings` → the 3 rows.
- `PATCH /api/v1/admin/practice-settings/:difficulty` → body
  `{ questionCount?, isEnabled? }`, updates one row.

**App-facing (requires user auth, alongside existing routes):**
- `GET /api/v1/practice-settings` → only rows where `is_enabled = 1`,
  shape `{ items: [{ difficulty, questionCount }] }`.
- `POST /api/v1/quiz-attempts/custom` → body `{ difficulty }`.
  1. Look up `practice_settings` for that difficulty; 404 if unknown
     difficulty, 400 if `is_enabled = 0`.
  2. `SELECT ... FROM questions WHERE difficulty_level = ? AND
     is_active = 1 ORDER BY RAND() LIMIT ?` using that row's
     `question_count`.
  3. 400 if zero questions come back (difficulty enabled but pool
     currently empty).
  4. Insert into `quiz_attempts` with `quiz_id = NULL`,
     `total_questions` = number of questions drawn.
  5. Insert one `quiz_attempt_questions` row per drawn question.
  6. Respond `{ attempt: <serialized quiz_attempts row>, questions:
     <same shape POST /quizzes/:id/questions returns today> }` — one
     call instead of the three a category quiz needs
     (find-by-slug → fetch-questions → start-attempt).

**Existing endpoint, modified:**
- `POST /quiz-attempts/:attemptId/answers` — the question-ownership
  query changes from unconditionally requiring `quiz_id` match to:
  first check whether `quiz_attempt_questions` has a row for
  `(attemptId, questionId)`; if the attempt has *any* rows in that
  table, that membership check replaces the `quiz_id` check for this
  attempt. Otherwise (the overwhelming majority of attempts — every
  category quiz), behavior is byte-for-byte identical to today.

**Unmodified, confirmed compatible:**
`POST /quiz-attempts/:id/submit`, `GET /quiz-attempts/:id/result`,
`src/services/quiz-attempts.js`, `src/services/gamification.js`, and
all `leaderboards.js` routes — none of them join or filter on
`quiz_id`.

### Admin panel (`frontend/src/features/content`)

The Quizzes page (`QuizzesPage.tsx`) gets a two-way toggle at the top,
next to (or replacing) its current filter row: **Quizzes | Practice**.

- **Quizzes** view: today's list, completely unchanged.
- **Practice** view: three rows, Easy/Medium/Hard, each with a
  question-count number input and an enabled switch, backed by the two
  new admin endpoints. Standard save-on-change or a per-row Save
  button, consistent with the rest of the admin panel's forms.

### Mobile app (`lib/features/categories`, `lib/app`)

`categories_page.dart` gets a segmented control — **Categories |
Practice** — inserted between the existing hero card and the list
below it. The hero card is unchanged regardless of which side is
selected.

- **Categories** side: today's `_CategoryRoad`, unchanged.
- **Practice** side: new `_PracticeSection` widget. Calls
  `GET /practice-settings` and renders one card per returned difficulty
  (skipping any the admin disabled). Tapping a card starts that
  difficulty's quiz.

`lib/features/quiz_question/data/quiz_api.dart` gains a method to call
`POST /quiz-attempts/custom`. `lib/app/quiz_catalog.dart` gains a
`prepareCustom(difficulty)` alongside the existing `prepare(...)`,
returning the same `QuizLaunch` shape so the rest of the play-through
(question screen, `RemoteQuizGrader`, results screen) needs no changes
at all — a practice attempt is, from that point on, indistinguishable
from a category attempt to the rest of the app.

Home screen (`lib/app/post_sign_up_flow.dart`,
`lib/features/home/**`) is not touched by this feature.

## Error handling

- Starting a practice quiz for a disabled or currently-empty difficulty
  returns a 400 with a clear message; the app surfaces it as a toast
  and does not show that difficulty as a choice in the first place
  (since it calls `GET /practice-settings` first, which already
  excludes disabled ones — the 400 path only matters for the
  currently-empty-pool case or a race with an admin disabling it
  mid-session).
- Network failures while starting or playing a practice quiz follow the
  exact same offline-fallback path `QuizCatalog.prepare` already uses
  for category quizzes — no new error handling code needed there.

## Testing

- Backend: a script exercising the admin settings endpoints (read,
  update count, disable/enable), then `POST /quiz-attempts/custom` for
  each difficulty through `/answers` and `/submit`, asserting the
  resulting points/streak/leaderboard changes match what an equivalent
  category-quiz attempt would produce. Also assert a disabled
  difficulty is rejected with 400.
- Manual verification on the Android emulator (via adb, as used
  earlier in this project) for both the admin panel and the app side.
