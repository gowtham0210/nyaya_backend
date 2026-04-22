# Feature Specification: Auth and Admin Shell

**Feature Branch**: `001-auth-and-admin-shell`  
**Created**: 2026-04-22  
**Status**: Implemented (Reverse Engineered)  
**Input**: Existing frontend code reverse-engineered from routed auth, layout,
session management, and HTTP client behavior.

## Affected Surface Area *(mandatory)*

- **Routes / Pages**: `/login`, `/access-denied`, and all protected admin routes
- **Feature Modules**: `src/features/auth/*`, `src/app/routes.tsx`,
  `src/app/layout/*`, `src/app/navigation.ts`,
  `src/app/providers/AuthProvider.tsx`, `src/lib/http-client.ts`
- **Queries / Mutations / APIs**: `POST /auth/login`, `POST /auth/refresh`,
  `GET /auth/me`, `POST /auth/logout`
- **Forms / Schemas**: login form schema, manual token schema
- **Auth / Permissions**: authenticated access required for admin workspace;
  `admin` role required after authentication

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin signs in and enters the portal (Priority: P1)

An admin can sign in on a dedicated login screen and is redirected into the
protected portal.

**Why this priority**: No other admin feature is usable without a working sign-in
flow.

**Independent Test**: Open `/login`, submit valid admin credentials, confirm the
user lands on the requested route or `/dashboard`.

**Acceptance Scenarios**:

1. **Given** an anonymous user on `/login`, **When** valid admin credentials are
   submitted, **Then** the session is created and the user is redirected into the
   admin workspace.
2. **Given** an anonymous user with `?devMode=1`, **When** a valid manual token is
   pasted, **Then** the token is accepted and the user is redirected into the
   admin workspace.

---

### User Story 2 - Existing sessions restore automatically (Priority: P1)

An authenticated admin does not need to sign in again after a normal refresh if
the refresh flow can restore the session.

**Why this priority**: This prevents unnecessary interruption during admin work.

**Independent Test**: Log in, refresh the browser, and confirm the portal shows
the booting state briefly before restoring the user session.

**Acceptance Scenarios**:

1. **Given** a valid refresh path, **When** the app boots, **Then** it calls the
   refresh endpoint and hydrates the user via `/auth/me`.
2. **Given** a valid in-memory access token, **When** expiry is near,
   **Then** refresh is scheduled proactively before timeout.

---

### User Story 3 - Unauthorized access is blocked safely (Priority: P2)

Users who are not authenticated or not admins are redirected away from protected
routes.

**Why this priority**: Admin content management must not be exposed to the wrong
users.

**Independent Test**: Try a protected route while anonymous and while signed in
as a non-admin user.

**Acceptance Scenarios**:

1. **Given** an anonymous visitor opens a protected route, **When** route guards
   run, **Then** the visitor is redirected to `/login`.
2. **Given** an authenticated non-admin user, **When** the route is admin-only,
   **Then** the user is redirected to `/access-denied`.

---

### User Story 4 - Admin can end the session cleanly (Priority: P2)

An authenticated admin can log out from the top bar and the portal clears local
session state.

**Why this priority**: Ending a session must be explicit and safe on shared or
temporary devices.

**Independent Test**: Log in, click logout, and confirm the app clears the
session and returns to `/login`.

**Acceptance Scenarios**:

1. **Given** an authenticated admin, **When** logout is clicked, **Then** the app
   calls `/auth/logout` and clears local session state.
2. **Given** logout API failure, **When** logout finishes, **Then** the UI still
   clears the client session and returns to the login route.

### Edge Cases

- Refresh succeeds but returns no access token during boot
- Multiple requests receive `401` at once and must not trigger refresh storms
- Session expires mid-route and the user must return to login with a reason
- Manual token mode must stay hidden unless `devMode=1` is present

## Contracts & Data *(mandatory when backend or data is affected)*

- **Contract Source**: `src/features/auth/api.ts`, `src/lib/http-client.ts`
- **Read Dependencies**: `GET /auth/me`
- **Write Dependencies**: `POST /auth/login`, `POST /auth/refresh`,
  `POST /auth/logout`
- **Validation Boundary**: Zod login and manual-token schemas; JWT role and
  expiry parsing in `src/lib/jwt.ts`
- **Unknowns / Clarifications**: Current UI assumes refresh-cookie support or an
  equivalent refresh contract already exists

## Experience & State Coverage *(mandatory when UI is affected)*

- **Loading State**: full-screen session-restore view while auth status is
  `booting`
- **Empty State**: not applicable
- **Error State**: inline login form errors, session-expired banner, access
  denied screen
- **Success / Feedback State**: welcome toast after login and redirect into the
  portal
- **Feature Lock / Deferral State**: manual token login is intentionally hidden
  unless `devMode=1`

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a dedicated `/login` route for admin sign-in.
- **FR-002**: System MUST restore sessions on boot by attempting refresh before
  rendering protected content.
- **FR-003**: System MUST protect all admin routes with authentication guards.
- **FR-004**: System MUST redirect authenticated non-admin users to an access
  denied screen.
- **FR-005**: System MUST attach bearer tokens to authenticated API requests.
- **FR-006**: System MUST retry authenticated requests after a successful single
  refresh attempt when `401` occurs.
- **FR-007**: System MUST clear session state and redirect to login when refresh
  fails or the session expires.
- **FR-008**: System MUST expose logout from the protected shell.
- **FR-009**: System MUST keep manual token sign-in behind a debug-only query
  flag.

### Key Entities *(include if feature involves data)*

- **Session State**: in-memory auth state including status, access token, user,
  and role
- **Auth Context**: API used by route guards, login page, and top bar to read or
  mutate session state
- **Navigation Metadata**: route titles and sidebar items used by the protected
  shell

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Admin can sign in and reach `/dashboard` without visiting a legacy
  single-screen tool.
- **SC-002**: Browser refresh restores a valid session without manual token
  re-entry.
- **SC-003**: Anonymous or non-admin access to protected routes is blocked on
  every attempt.
- **SC-004**: Logout clears the portal state and returns the user to `/login`.

## Assumptions

- Backend auth endpoints already exist and return the fields consumed by the
  current auth helpers.
- The portal is an admin-only surface and does not provide non-admin fallback
  content.
- Refresh behavior is cookie-based or otherwise opaque to the frontend beyond
  the current `refreshRequest()` contract.
