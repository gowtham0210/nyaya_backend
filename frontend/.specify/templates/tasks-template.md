---

description: "Task list template for feature implementation"
---

# Tasks: [FEATURE NAME]

**Input**: Design documents from `/specs/[###-feature-name]/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Include automated tests whenever the feature changes auth or session
handling, schema validation, API contracts or mapping, or non-trivial user
flows. For simple presentation-only changes, document why automated coverage is
deferred.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **This project**: `src/app/`, `src/components/`, `src/features/`, `src/lib/`, `src/generated/`, `tests/`
- Keep feature-local work inside `src/features/[feature]/` unless the plan shows a genuine shared concern
- Place all automated tests under `tests/`; do not create new `*.test.*` files in `src/`
- Use exact frontend file paths in every task description

<!-- 
  ============================================================================
  IMPORTANT: The tasks below are SAMPLE TASKS for illustration purposes only.
  
  The /speckit.tasks command MUST replace these with actual tasks based on:
  - User stories from spec.md (with their priorities P1, P2, P3...)
  - Feature requirements from plan.md
  - Entities from data-model.md
  - Endpoints from contracts/
  
  Tasks MUST be organized by user story so each story can be:
  - Implemented independently
  - Tested independently
  - Delivered as an MVP increment
  
  DO NOT keep these sample tasks in the generated tasks.md file.
  ============================================================================
-->

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Confirm affected routes, feature modules, and user stories from plan.md
- [ ] T002 Confirm API contract references and `[NEEDS CLARIFICATION]` items for this slice
- [ ] T003 [P] Prepare feature-local files and shared touchpoints called out by the implementation plan

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

Examples of foundational tasks (adjust based on your project):

- [ ] T004 [P] Add or update contract typing in `src/generated/openapi.d.ts` or approved feature-local types
- [ ] T005 [P] Add or update validation schemas in `src/features/[feature]/schemas.ts`
- [ ] T006 [P] Add or update request helpers in `src/features/[feature]/api.ts`
- [ ] T007 Wire shared route, navigation, or provider changes in `src/app/*` if required by the plan
- [ ] T008 Capture auth, permission, or session-handling changes in `src/app/providers/*` or `src/lib/*`
- [ ] T009 Prepare shared test utilities or fixtures in `tests/*` when multiple stories depend on them

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - [Title] (Priority: P1) 🎯 MVP

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 1 (OPTIONAL - only if tests requested) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T010 [P] [US1] Add API or schema coverage in `tests/features/[feature]/api.test.ts` or `tests/features/[feature]/schemas.test.ts`
- [ ] T011 [P] [US1] Add user-flow coverage in `tests/features/[feature]/[FeaturePage].test.tsx`

### Implementation for User Story 1

- [ ] T012 [P] [US1] Implement or update data contract and validation boundaries in `src/features/[feature]/api.ts` and `src/features/[feature]/schemas.ts`
- [ ] T013 [P] [US1] Build page or component behavior in `src/features/[feature]/[FeaturePage].tsx`
- [ ] T014 [US1] Wire route, navigation, or provider integration in `src/app/routes.tsx`, `src/app/navigation.ts`, or `src/app/providers/*`
- [ ] T015 [US1] Implement loading, empty, error, and success feedback states
- [ ] T016 [US1] Add query invalidation, toast behavior, and permission guards where required
- [ ] T017 [US1] Validate the story independently using the quickstart scenario

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - [Title] (Priority: P2)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 2 (OPTIONAL - only if tests requested) ⚠️

- [ ] T018 [P] [US2] Add API or schema coverage in `tests/features/[feature]/api.test.ts` or `tests/features/[feature]/schemas.test.ts`
- [ ] T019 [P] [US2] Add user-flow coverage in `tests/features/[feature]/[FeaturePage].test.tsx`

### Implementation for User Story 2

- [ ] T020 [P] [US2] Extend contract, query, or schema support in `src/features/[feature]/api.ts` and related files
- [ ] T021 [US2] Implement the user-facing slice in `src/features/[feature]/[FeaturePage].tsx` or supporting components
- [ ] T022 [US2] Add auth-aware feedback, empty-state, and error-state handling for this flow
- [ ] T023 [US2] Integrate with shared app shell or previously delivered story behavior only where required

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - [Title] (Priority: P3)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 3 (OPTIONAL - only if tests requested) ⚠️

- [ ] T024 [P] [US3] Add API or schema coverage in `tests/features/[feature]/api.test.ts` or `tests/features/[feature]/schemas.test.ts`
- [ ] T025 [P] [US3] Add user-flow coverage in `tests/features/[feature]/[FeaturePage].test.tsx`

### Implementation for User Story 3

- [ ] T026 [P] [US3] Extend feature-local data or schema handling in `src/features/[feature]/*`
- [ ] T027 [US3] Implement the user-facing slice in `src/features/[feature]/[FeaturePage].tsx` or supporting components
- [ ] T028 [US3] Verify routes, permissions, and feedback behavior stay independently testable

**Checkpoint**: All user stories should now be independently functional

---

[Add more user story phases as needed, following the same pattern]

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] TXXX [P] Update quickstart, operator notes, or feature docs for changed behavior
- [ ] TXXX Code cleanup and refactoring
- [ ] TXXX Performance or UX polish across all stories
- [ ] TXXX [P] Add or expand automated coverage in `tests/**/*.test.ts` or `tests/**/*.test.tsx`
- [ ] TXXX Security hardening
- [ ] TXXX Run quickstart.md validation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - May integrate with US1 but should be independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - May integrate with US1/US2 but should be independently testable

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Contracts and schemas before UI wiring
- API helpers before route integration
- Core implementation before integration
- Loading, empty, error, and success feedback states before story sign-off
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- Contract, schema, and view-layer tasks within a story marked [P] can run in parallel when they touch different files
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together (if tests requested):
Task: "Add API or schema coverage in tests/features/[feature]/api.test.ts or tests/features/[feature]/schemas.test.ts"
Task: "Add user-flow coverage in tests/features/[feature]/[FeaturePage].test.tsx"

# Launch parallel implementation work for User Story 1:
Task: "Implement or update data contract and validation boundaries in src/features/[feature]/api.ts and src/features/[feature]/schemas.ts"
Task: "Build page or component behavior in src/features/[feature]/[FeaturePage].tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
