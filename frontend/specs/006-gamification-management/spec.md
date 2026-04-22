# Feature Specification: Gamification Management

**Feature Branch**: `006-gamification-management`  
**Created**: 2026-04-22  
**Status**: Implemented (Reverse Engineered)  
**Input**: Existing levels and leaderboards routes.

## Affected Surface Area *(mandatory)*

- **Routes / Pages**: `/gamification/levels`, `/gamification/leaderboards`
- **Feature Modules**: `src/features/gamification/*`,
  `src/features/content/schemas.ts`
- **Queries / Mutations / APIs**: `GET /levels`, `POST /admin/levels`,
  `PATCH /admin/levels/{id}`, `GET /leaderboards/global`,
  `GET /leaderboards/weekly`, `GET /leaderboards/category/{categoryId}`,
  `GET /categories`
- **Forms / Schemas**: `levelSchema`
- **Auth / Permissions**: protected admin routes

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin configures progression levels (Priority: P1)

An admin can create and edit level ranges used to represent learner progression.

**Why this priority**: Levels are core gamification data and must be editable by
operations staff.

**Independent Test**: Open `/gamification/levels`, create a level, and edit an
existing level through the side sheet.

**Acceptance Scenarios**:

1. **Given** the levels page, **When** the admin opens the create sheet and saves
   valid values, **Then** a new level is created and the list refreshes.
2. **Given** an existing level, **When** the edit action is used,
   **Then** the sheet loads current values and updates them successfully.

---

### User Story 2 - Admin previews level ranges visually (Priority: P2)

An admin can see level thresholds as a simple ladder preview before or after
editing.

**Why this priority**: Point ranges are easier to sanity-check visually than from
raw rows alone.

**Independent Test**: Load multiple levels and confirm the ladder preview renders
proportionate segments and summary cards.

**Acceptance Scenarios**:

1. **Given** one or more levels, **When** the page loads,
   **Then** a ladder preview and per-level point range summary are shown.
2. **Given** no levels, **When** the page loads, **Then** an empty state explains
   how to start.

---

### User Story 3 - Admin reviews and exports leaderboards (Priority: P1)

An admin can switch between global, weekly, and category leaderboard scopes and
export the current view to CSV.

**Why this priority**: Leaderboards are the main read-only gamification insight
screen in the current portal.

**Independent Test**: Open `/gamification/leaderboards`, switch scopes, adjust the
limit, and export CSV.

**Acceptance Scenarios**:

1. **Given** global or weekly scope, **When** the page loads,
   **Then** the corresponding leaderboard entries are shown in a table.
2. **Given** category scope, **When** no category is selected,
   **Then** the page shows an empty instruction state until a category is chosen.

### Edge Cases

- No level data exists yet
- Category leaderboard requested without a selected category
- Leaderboard data is empty for the chosen scope

## Contracts & Data *(mandatory when backend or data is affected)*

- **Contract Source**: `src/features/gamification/api.ts`, `src/lib/types.ts`
- **Read Dependencies**: `GET /levels`, `GET /categories`, leaderboard read
  endpoints
- **Write Dependencies**: `POST /admin/levels`, `PATCH /admin/levels/{id}`
- **Validation Boundary**: `levelSchema`
- **Unknowns / Clarifications**: current UI supports level create and edit, but
  not delete

## Experience & State Coverage *(mandatory when UI is affected)*

- **Loading State**: routes render with query-driven loading and safe fallbacks
- **Empty State**: levels and leaderboard routes both include dedicated empty
  states
- **Error State**: mutation failures surface through toast errors
- **Success / Feedback State**: level create and update actions show success
  toasts; leaderboard export downloads a CSV file
- **Feature Lock / Deferral State**: category-scoped leaderboard waits on a
  selected category before loading

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST list all current levels and support create/edit flows.
- **FR-002**: System MUST validate level point ranges through `levelSchema`.
- **FR-003**: System MUST show a visual ladder preview for configured levels.
- **FR-004**: System MUST support leaderboard scopes for global, weekly, and
  category views.
- **FR-005**: System MUST support configurable leaderboard limits of 10, 25, 50,
  or 100.
- **FR-006**: System MUST allow exporting the currently loaded leaderboard view
  to CSV.

### Key Entities *(include if feature involves data)*

- **Level**: named point range with code, optional badge label, and reward
  description
- **Leaderboard Entry**: rank, user, total points, and current level snapshot

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Admin can create and edit progression levels without leaving the
  levels route.
- **SC-002**: Admin can view leaderboard rankings across all supported scopes.
- **SC-003**: Current leaderboard data can be exported directly from the UI.

## Assumptions

- Leaderboard data is read-only in the frontend.
- Level ordering in the ladder preview depends on the order returned by the API.
