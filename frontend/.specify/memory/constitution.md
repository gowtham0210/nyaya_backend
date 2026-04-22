<!--
Sync Impact Report
- Version change: 1.0.0 -> 1.1.0
- Modified principles:
  - Template principle 1 -> I. Spec-First Feature Slices
  - Template principle 2 -> II. Contract-First Backend Integration
  - Template principle 3 -> III. Validated Boundaries and Explicit Types
  - Template principle 4 -> IV. Secure Admin Flows Are Part of the Feature
  - Template principle 5 -> V. Independent, Testable, Minimal Changes
- Added sections:
  - Delivery & Quality Gates
  - Architecture & Folder Conventions
- Removed sections:
  - None
- Templates requiring updates:
  - ✅ .specify/templates/plan-template.md
  - ✅ .specify/templates/spec-template.md
  - ✅ .specify/templates/tasks-template.md
- Follow-up TODOs:
  - None
-->
# Nyaya Admin Frontend Constitution

## Core Principles

### I. Spec-First Feature Slices
Every change that affects product behavior MUST begin with a feature spec that
names the affected routes or pages, prioritized user stories, acceptance
scenarios, measurable success criteria, and the smallest independently valuable
slice. Plans and tasks MUST trace directly back to those artifacts. Work without
a spec is allowed only for urgent build, test, or tooling repairs that do not
change user-facing behavior.

Rationale: This app is organized around routes and feature folders. Spec-first
delivery keeps behavior reviewable and prevents route-level drift.

### II. Contract-First Backend Integration
Any UI that depends on backend behavior MUST cite the approved API contract
before implementation. `src/generated/openapi.d.ts`, the checked-in OpenAPI
schema, or an explicit endpoint contract in the feature spec is the source of
truth. If an endpoint, field, filter, or permission model is unknown, the spec
MUST use a `NEEDS CLARIFICATION: ...` marker or define an explicit
feature-locked or
deferred experience instead of inventing production behavior.

Rationale: This admin UI already contains intentionally locked modules when
admin APIs are missing; continuing that discipline avoids speculative
integrations.

### III. Validated Boundaries and Explicit Types
User input, form values, query params, and server payload transformations MUST
cross a named validation or typing boundary. New or changed forms MUST use
explicit schemas such as Zod. New or touched code MUST not introduce `any`
unless the reason and containment are documented in the plan. Silent coercion,
hidden fallback data shaping, and untyped response reshaping are prohibited.

Rationale: The project is not yet in strict TypeScript mode, so correctness
depends on deliberate validation and explicit boundaries.

### IV. Secure Admin Flows Are Part of the Feature
Any change that can affect access, visibility, or session behavior MUST specify
auth state, role expectations, token or refresh behavior, session-expiry
handling, and unauthorized or error outcomes. Protected routes and admin-only
actions MUST fail safely and surface clear user feedback. Features MUST not
bypass the existing auth bridge, guarded routing, or session-clearing behavior
without an approved constitution exception.

Rationale: Admin errors are high-impact; the auth provider and HTTP client
already encode security-critical behavior that specs must preserve.

### V. Independent, Testable, Minimal Changes
Each prioritized user story MUST be independently implementable, demonstrable,
and verifiable. Every user-facing flow MUST define loading, empty, error, and
success or feedback states when applicable. Teams MUST prefer feature-local code
and existing shared primitives before adding new abstractions, global state, or
dependencies. Any new abstraction MUST be justified by real duplication or a
clear spec-backed reuse case.

Rationale: Small slices fit the current feature-folder architecture and reduce
regression risk across CRUD-heavy admin flows.

## Delivery & Quality Gates
- Every plan MUST list the affected routes, pages, feature modules, and shared
  components.
- Every plan MUST state query and mutation impact, including cache keys or
  invalidation strategy when React Query behavior changes.
- Every plan MUST document API dependencies, request or response contracts, and
  any `NEEDS CLARIFICATION` items before implementation begins.
- Every plan MUST describe auth and permission impact, including whether
  admin-only access, token refresh, or session expiry behavior changes.
- Every UI-affecting spec MUST define loading, empty, error, and success or
  feedback behavior, including toast or inline messaging when relevant.
- Every feature that accepts or transforms user input MUST identify the
  validation boundary and the owning schema or type file.
- Tasks MUST include verification steps proportionate to risk. At minimum,
  changed logic, schemas, or auth-sensitive flows MUST have automated tests or
  an explicit justification for why automated coverage is deferred.
- Specs, plans, and tasks MUST place automated test files under the top-level
  `tests/` directory and MUST NOT place new `*.test.*` files under `src/`.
- Quickstart or operator-facing documentation MUST be updated when a feature
  changes behavior, dependencies, setup steps, or manual validation flow.
- If required backend capability is missing, the approved outcomes are feature
  lock, scoped deferral, or a clarified follow-up spec. Mocked production
  behavior is not allowed.

## Architecture & Folder Conventions
- `src/features/*` is the default home for feature-specific pages, API calls,
  schemas, and view logic.
- `src/components/ui/*` and `src/components/shared/*` are for reusable
  primitives and cross-feature presentation patterns that already serve multiple
  features.
- `src/app/*` owns app shell, layout, providers, navigation, and routing
  composition. Route additions or protection changes MUST be reflected there.
- `src/lib/*` is reserved for cross-cutting infrastructure such as HTTP clients,
  auth bridges, token helpers, and query client setup. Feature code MUST not
  move into `src/lib/*` unless it truly supports multiple unrelated features.
- `src/generated/openapi.d.ts` is generated contract output and MUST not be
  hand-edited. Contract regeneration belongs in dedicated tasks when the backend
  schema changes.
- Automated tests, fixtures, and test setup files MUST live under the top-level
  `tests/` directory. New `*.test.*` files inside `src/` are prohibited.
- New directories, dependencies, or global state mechanisms MUST be justified in
  the implementation plan's Complexity Tracking section.
- Touched code MUST become more explicit and typed than the code it replaces
  whenever practical, even if surrounding legacy code remains less strict.

## Governance
This constitution governs specification, planning, task generation, and
implementation for the `frontend/` workspace. Plans MUST pass the Constitution
Check before Phase 0 research and again after Phase 1 design.

Amendments MUST include:
- a written rationale,
- the semantic version bump rationale,
- any required template or workflow updates,
- and a migration note when a rule changes how existing features should be
  implemented.

Compliance review expectations:
- Every feature spec MUST show route impact, contract impact, validation impact,
  auth impact, and UI-state coverage.
- Every implementation plan MUST document any constitution violation in
  Complexity Tracking with a simpler rejected alternative.
- Every task list MUST preserve independently testable user stories and include
  validation, auth, API, and UI-state work where relevant.

Versioning policy:
- MAJOR for incompatible governance changes or principle removals or
  redefinitions.
- MINOR for new principles, new mandatory gates, or materially expanded
  guidance.
- PATCH for clarifications and wording-only improvements.

When a Constitution Check fails, work MUST stop until the issue is either
resolved in the spec, plan, or tasks artifacts, or explicitly justified in
Complexity Tracking and approved as an intentional exception.

**Version**: 1.1.0 | **Ratified**: 2026-04-22 | **Last Amended**: 2026-04-22
