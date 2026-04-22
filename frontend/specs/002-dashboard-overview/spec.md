# Feature Specification: Dashboard Overview

**Feature Branch**: `002-dashboard-overview`  
**Created**: 2026-04-22  
**Status**: Implemented (Reverse Engineered)  
**Input**: Existing dashboard route, data query, and KPI panels.

## Affected Surface Area *(mandatory)*

- **Routes / Pages**: `/dashboard`
- **Feature Modules**: `src/features/dashboard/*`
- **Queries / Mutations / APIs**: `GET /admin/dashboard`
- **Forms / Schemas**: none
- **Auth / Permissions**: protected admin route only

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin reviews platform health from one screen (Priority: P1)

An admin can open the dashboard and see key activity and content totals without
drilling into each module.

**Why this priority**: This is the default landing page after login.

**Independent Test**: Open `/dashboard` after signing in and confirm summary
cards load from the dashboard API.

**Acceptance Scenarios**:

1. **Given** an authenticated admin, **When** the dashboard route loads,
   **Then** KPI cards show category, quiz, question, attempts, and level totals.
2. **Given** current summary data, **When** the page renders, **Then** the
   dashboard also shows top quizzes, leaderboard preview, recent questions, and
   recent attempts.

---

### User Story 2 - Admin sees sensible empty states when activity is low (Priority: P2)

An admin still gets a readable dashboard even when there is no attempt or
leaderboard data yet.

**Why this priority**: Early-stage or low-traffic environments should not look
broken.

**Independent Test**: Provide an empty dashboard response and confirm the page
shows empty-state cards instead of blank sections.

**Acceptance Scenarios**:

1. **Given** no top-quiz attempt data, **When** the dashboard renders,
   **Then** the top quizzes panel shows an empty-state message.
2. **Given** no leaderboard or recent activity data, **When** the dashboard
   renders, **Then** those panels show informative empty-state content.

### Edge Cases

- Summary numbers load before list sections
- Dashboard query refreshes while the page is already open
- Recent attempt status values vary between submitted and in-progress style data

## Contracts & Data *(mandatory when backend or data is affected)*

- **Contract Source**: `src/features/dashboard/api.ts`, `src/lib/types.ts`
- **Read Dependencies**: `GET /admin/dashboard`
- **Write Dependencies**: none
- **Validation Boundary**: typed dashboard summary response
- **Unknowns / Clarifications**: none for current UI

## Experience & State Coverage *(mandatory when UI is affected)*

- **Loading State**: summary cards and panels render with safe fallback values
  while the query resolves
- **Empty State**: dedicated empty panels for top quizzes, leaderboard, recent
  questions, and recent attempts
- **Error State**: global query error handling falls back to React Query default
  behavior; no page-specific inline error panel exists yet
- **Success / Feedback State**: live or refreshing badge appears in the top quiz
  panel
- **Feature Lock / Deferral State**: not applicable

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST show a dashboard overview on `/dashboard`.
- **FR-002**: System MUST query `GET /admin/dashboard` through the shared HTTP
  client.
- **FR-003**: System MUST display KPI cards for categories, quizzes, questions,
  attempts today, and configured levels.
- **FR-004**: System MUST display a top-quizzes table and a leaderboard preview.
- **FR-005**: System MUST display recent questions and recent attempts.
- **FR-006**: System MUST show readable empty states when list data is absent.

### Key Entities *(include if feature involves data)*

- **Dashboard Summary**: aggregate dashboard response with stats and preview
  collections
- **Leaderboard Preview Entry**: rank, user, total points, and level snapshot
- **Recent Activity Records**: latest questions and latest attempts shown on the
  overview screen

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Admin sees a usable overview screen immediately after login.
- **SC-002**: Dashboard shows both aggregate counts and recent activity in a
  single page load.
- **SC-003**: Empty data conditions do not create blank or confusing panels.

## Assumptions

- Dashboard aggregation is handled server-side and returned as a single summary
  payload.
- The dashboard is read-only in the current implementation.
