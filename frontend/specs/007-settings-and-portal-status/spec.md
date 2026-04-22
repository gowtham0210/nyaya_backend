# Feature Specification: Settings and Portal Status

**Feature Branch**: `007-settings-and-portal-status`  
**Created**: 2026-04-22  
**Status**: Implemented (Reverse Engineered)  
**Input**: Existing read-only settings route showing session and environment
details.

## Affected Surface Area *(mandatory)*

- **Routes / Pages**: `/settings`
- **Feature Modules**: `src/features/settings/SettingsPage.tsx`
- **Queries / Mutations / APIs**: none directly; consumes auth context
- **Forms / Schemas**: none
- **Auth / Permissions**: protected admin route

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin reviews the current session context (Priority: P1)

An admin can open settings and confirm which account is signed in and what role
it carries.

**Why this priority**: This is a lightweight operational screen for sanity checks.

**Independent Test**: Open `/settings` while signed in and confirm session data
matches the authenticated user.

**Acceptance Scenarios**:

1. **Given** a signed-in admin, **When** `/settings` loads, **Then** the page
   shows session status, name, email, role, and account-created timestamp.
2. **Given** missing user fields, **When** the page renders, **Then** missing
   values are shown as fallback text instead of breaking the layout.

---

### User Story 2 - Admin reviews environment wiring and portal scope (Priority: P2)

An admin can verify the current API base URL and see which modules are enabled or
deferred today.

**Why this priority**: This page helps operations and QA quickly understand the
current environment.

**Independent Test**: Open `/settings` and confirm environment and module notes
render without additional API calls.

**Acceptance Scenarios**:

1. **Given** the settings route, **When** the environment panel renders,
   **Then** it shows API base URL and current auth model notes.
2. **Given** the current portal scope, **When** the settings route renders,
   **Then** it lists enabled modules and deferred modules.

### Edge Cases

- User data is missing during initial render
- API base URL includes a long value that needs wrapping

## Contracts & Data *(mandatory when backend or data is affected)*

- **Contract Source**: auth context and local config values
- **Read Dependencies**: none beyond already loaded auth state
- **Write Dependencies**: none
- **Validation Boundary**: not applicable
- **Unknowns / Clarifications**: module status text is static UI copy

## Experience & State Coverage *(mandatory when UI is affected)*

- **Loading State**: route depends on already restored auth context
- **Empty State**: not applicable
- **Error State**: not applicable for current implementation
- **Success / Feedback State**: read-only information panels
- **Feature Lock / Deferral State**: page explicitly lists deferred modules

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a read-only settings route.
- **FR-002**: System MUST display current session identity details.
- **FR-003**: System MUST display API base URL and auth model notes.
- **FR-004**: System MUST display which modules are enabled today.
- **FR-005**: System MUST display which modules remain deferred.

### Key Entities *(include if feature involves data)*

- **Session Snapshot**: current auth status and user profile details shown on the
  page
- **Environment Snapshot**: current API base URL, auth model summary, and module
  status summary

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Admin can confirm current session identity and role from one screen.
- **SC-002**: Admin can confirm environment wiring and deferred module notes
  without leaving the portal.

## Assumptions

- Settings is intentionally read-only in the current product.
