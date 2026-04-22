# Feature Specification: [FEATURE NAME]

**Feature Branch**: `[###-feature-name]`  
**Created**: [DATE]  
**Status**: Draft  
**Input**: User description: "$ARGUMENTS"

## Affected Surface Area *(mandatory)*

- **Routes / Pages**: [List affected routes, entry points, redirects, or "None"]
- **Feature Modules**: [List `src/features/*` modules and shared components touched]
- **Queries / Mutations / APIs**: [List read/write endpoints, query keys, or "None"]
- **Forms / Schemas**: [List input surfaces and owning schema/type files, or "None"]
- **Tests**: [List planned or existing test files under `tests/`, or "None"]
- **Auth / Permissions**: [List roles, guards, session behavior, or "No change"]

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.
  
  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
  - Described with loading, empty, error, and success outcomes when applicable
-->

### User Story 1 - [Brief Title] (Priority: P1)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently - e.g., "Can be fully tested by [specific action] and delivers [specific value]"]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]
2. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 2 - [Brief Title] (Priority: P2)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 3 - [Brief Title] (Priority: P3)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right edge cases.
-->

- What happens when the backend contract is missing, partial, or returns no data?
- How does the system handle auth expiry, permission denial, or stale session state?
- What happens when validation fails or payload data is incomplete?
- What happens when optimistic assumptions about API shape are wrong?

## Contracts & Data *(mandatory when backend or data is affected)*

- **Contract Source**: [`src/generated/openapi.d.ts`, `openAPI_schema.yaml`, explicit endpoint doc, or "N/A"]
- **Read Dependencies**: [List GET/read operations and expected response shapes]
- **Write Dependencies**: [List POST/PATCH/DELETE operations and mutation effects]
- **Validation Boundary**: [List schema/type files that validate input or normalize data]
- **Unknowns / Clarifications**: [List `[NEEDS CLARIFICATION: ...]` items or "None"]

## Experience & State Coverage *(mandatory when UI is affected)*

- **Loading State**: [Describe skeleton/spinner/disabled actions]
- **Empty State**: [Describe zero-data or unavailable-data behavior]
- **Error State**: [Describe inline, toast, retry, and failure behavior]
- **Success / Feedback State**: [Describe confirmations, toasts, redirects, or optimistic updates]
- **Feature Lock / Deferral State**: [Describe approved locked/deferred UX if backend support is missing, or "N/A"]

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001**: System MUST [specific capability, e.g., "allow users to create accounts"]
- **FR-002**: System MUST [specific capability, e.g., "validate email addresses"]  
- **FR-003**: Users MUST be able to [key interaction, e.g., "reset their password"]
- **FR-004**: System MUST [data requirement, e.g., "persist user preferences"]
- **FR-005**: System MUST [behavior, e.g., "log all security events"]
- **FR-006**: System MUST define auth/permission expectations for affected routes or actions
- **FR-007**: System MUST define loading, empty, error, and success behavior for affected user flows

*Example of marking unclear requirements:*

- **FR-008**: System MUST authenticate users via [NEEDS CLARIFICATION: auth method not specified - email/password, SSO, OAuth?]
- **FR-009**: System MUST retain user data for [NEEDS CLARIFICATION: retention period not specified]

### Key Entities *(include if feature involves data)*

- **[Entity 1]**: [What it represents, key attributes without implementation]
- **[Entity 2]**: [What it represents, relationships to other entities]

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: [Measurable metric, e.g., "Users can complete account creation in under 2 minutes"]
- **SC-002**: [Measurable metric, e.g., "System handles 1000 concurrent users without degradation"]
- **SC-003**: [User satisfaction metric, e.g., "90% of users successfully complete primary task on first attempt"]
- **SC-004**: [Business metric, e.g., "Reduce support tickets related to [X] by 50%"]

## Assumptions

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right assumptions based on reasonable defaults
  chosen when the feature description did not specify certain details.
-->

- [Assumption about target users, e.g., "Users have stable internet connectivity"]
- [Assumption about scope boundaries, e.g., "Mobile support is out of scope for v1"]
- [Assumption about data/environment, e.g., "Existing authentication system will be reused"]
- [Dependency on existing system/service, e.g., "Requires access to the existing user profile API"]
- [Assumption about missing backend capabilities, e.g., "Unavailable admin endpoints will be feature-locked instead of mocked"]
