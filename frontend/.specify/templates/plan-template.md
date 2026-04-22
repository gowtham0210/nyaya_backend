# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

[Summarize the user-visible change, contract expectations, and the smallest
independently valuable slice.]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript 5.x, React 18, Vite 5 (note any feature-specific additions)  
**Primary Dependencies**: React Router, TanStack Query, Axios, Zod, React Hook Form, Vitest, Testing Library  
**Storage**: Browser state plus remote admin APIs; no client-side persistence unless explicitly specified  
**Testing**: Vitest + Testing Library with all test files under top-level `tests/`; add API or schema unit tests for risky logic  
**Target Platform**: Browser-based admin portal (desktop-first, responsive where applicable)  
**Project Type**: Frontend web application  
**Performance Goals**: Maintain responsive admin flows; define feature-specific thresholds when performance is user-visible  
**Constraints**: Protected admin routes, contract-first backend integration, explicit validation boundaries, no invented backend behavior  
**Scale/Scope**: Feature-local slice within `frontend/`; prefer minimal changes to existing app shell and shared primitives

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [ ] Spec-first scope names affected routes or pages, prioritized user stories,
      acceptance scenarios, and measurable success criteria.
- [ ] Backend-dependent behavior cites an approved API contract
      (`src/generated/openapi.d.ts`, the checked-in OpenAPI schema, or an
      explicit endpoint contract).
- [ ] Unknown backend behavior is captured as `[NEEDS CLARIFICATION]` or
      handled through feature lock or scoped deferral.
- [ ] Validation boundaries are identified for user input, query params, and
      payload transforms; no new `any` appears without justification.
- [ ] Auth, permissions, and session-expiry impact are documented for all
      affected routes and actions.
- [ ] Loading, empty, error, and success or feedback states are specified for
      each affected user flow.
- [ ] Test strategy covers changed logic, schemas, and auth-sensitive behavior,
      or explains why automated coverage is deferred.
- [ ] New shared abstractions, folders, global state, or dependencies are
      justified in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── layout/
│   ├── providers/
│   ├── navigation.ts
│   └── routes.tsx
├── components/
│   ├── shared/
│   └── ui/
├── features/
│   ├── auth/
│   ├── content/
│   ├── dashboard/
│   ├── gamification/
│   └── settings/
├── generated/
├── lib/
tests/
├── features/
├── lib/
└── setup.ts
```

**Structure Decision**: Keep feature logic in `src/features/*` by default and
limit shared changes to `src/app/*`, `src/components/*`, and `src/lib/*` only
when the spec proves cross-feature reuse or infrastructure impact. Keep all test
artifacts under `tests/`, never under `src/`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
