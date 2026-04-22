# Feature Specification: Quizzes and Questions Management

**Feature Branch**: `004-quizzes-and-questions-management`  
**Created**: 2026-04-22  
**Status**: Implemented (Reverse Engineered)  
**Input**: Existing quiz and question management routes, filters, forms, option
editing, drag reorder, and background reconciliation behavior.

## Affected Surface Area *(mandatory)*

- **Routes / Pages**: `/content/quizzes`, `/content/questions`
- **Feature Modules**: `src/features/content/QuizzesPage.tsx`,
  `src/features/content/QuestionsPage.tsx`, `src/features/content/api.ts`,
  `src/features/content/schemas.ts`
- **Queries / Mutations / APIs**: `GET /admin/quizzes`,
  `POST /admin/quizzes`, `PATCH /admin/quizzes/{id}`,
  `DELETE /admin/quizzes/{id}`, `GET /admin/quizzes/{quizId}/questions`,
  `POST /admin/questions`, `PATCH /admin/questions/{id}`,
  `DELETE /admin/questions/{id}`, `POST /admin/questions/{id}/options`,
  `PATCH /admin/options/{id}`, `DELETE /admin/options/{id}`
- **Forms / Schemas**: `quizSchema`, `questionSchema`, option rules
- **Auth / Permissions**: protected admin routes

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin manages quiz metadata (Priority: P1)

An admin can list quizzes, filter them by category, search them, and create or
edit quiz metadata from a side sheet.

**Why this priority**: Quizzes are the container for questions and must be
manageable before question authoring.

**Independent Test**: Open `/content/quizzes`, filter by category, create a new
quiz, then edit an existing one.

**Acceptance Scenarios**:

1. **Given** quizzes exist, **When** the route loads, **Then** the table shows
   quiz title, category, difficulty, question count, status, and updated time.
2. **Given** a valid quiz form submission, **When** create or edit is saved,
   **Then** the list refreshes and dashboard-dependent cache is invalidated.

---

### User Story 2 - Admin manages questions and answer options (Priority: P1)

An admin can choose a category and quiz, then create or edit questions with
their answer options in the same workflow.

**Why this priority**: Question authoring is the main content-production task in
the portal.

**Independent Test**: Open `/content/questions`, select a quiz, create a
question with options, then edit an existing question.

**Acceptance Scenarios**:

1. **Given** a category and quiz are selected, **When** the question sheet opens,
   **Then** the form captures text, type, difficulty, scoring, explanation,
   status, and options.
2. **Given** an existing question, **When** it is edited, **Then** existing
   options are loaded and removed options are deleted on save.

---

### User Story 3 - Admin reorders questions and keeps counts aligned (Priority: P2)

An admin can drag questions into a new order, and the app keeps the stored quiz
question count aligned with the actual loaded questions.

**Why this priority**: Question order affects quiz flow and question totals
should stay trustworthy.

**Independent Test**: Drag a question to a new position and confirm the display
order changes. Load a quiz whose stored total is wrong and confirm reconciliation
triggers.

**Acceptance Scenarios**:

1. **Given** loaded questions for a selected quiz, **When** a question card is
   dragged and dropped, **Then** normalized display order is saved through the
   reorder mutation.
2. **Given** the loaded question count differs from the quiz's stored
   `totalQuestions`, **When** the page detects the mismatch,
   **Then** the app silently patches the quiz count in the background.

---

### User Story 4 - Admin deactivates quizzes and questions safely (Priority: P2)

An admin can deactivate quizzes and questions with confirmation instead of
hard-deleting them from the UI.

**Why this priority**: Editors need safe lifecycle control over content records.

**Independent Test**: Use deactivate actions on quiz and question records and
cancel or confirm the prompts.

**Acceptance Scenarios**:

1. **Given** a quiz or question row, **When** deactivate is confirmed,
   **Then** the item is deactivated and related queries are invalidated.
2. **Given** deactivate is cancelled, **When** the confirm dialog closes,
   **Then** no mutation is sent.

### Edge Cases

- No category selected yet on the questions route
- Selected quiz disappears after filter changes
- Question options must keep at least one correct answer
- Display order collisions can happen if manual edits conflict
- Quiz question count may drift from actual question rows

## Contracts & Data *(mandatory when backend or data is affected)*

- **Contract Source**: `src/features/content/api.ts`, `src/lib/types.ts`
- **Read Dependencies**: `GET /admin/quizzes`, `GET /admin/quizzes/{quizId}/questions`
- **Write Dependencies**: quiz create/update/deactivate endpoints, question
  create/update/deactivate endpoints, option create/update/delete endpoints,
  question reorder patches, quiz count reconciliation patch
- **Validation Boundary**: `quizSchema`, `questionSchema`, Zod option refinement
- **Unknowns / Clarifications**: question count sync is handled client-side based
  on loaded rows

## Experience & State Coverage *(mandatory when UI is affected)*

- **Loading State**: list pages render with query-driven data loading and disable
  dependent flows until the required selection exists
- **Empty State**: quizzes route and questions route each show dedicated empty
  states when no matching records exist
- **Error State**: mutation failures surface through toast errors
- **Success / Feedback State**: create, update, reorder, and deactivate actions
  show success toasts
- **Feature Lock / Deferral State**: the questions create action is blocked until
  a quiz is selected

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST list quizzes with category, difficulty, question count,
  status, and updated time.
- **FR-002**: System MUST support quiz filtering by category, search term, and
  inactive visibility.
- **FR-003**: System MUST create and edit quizzes through a validated side sheet.
- **FR-004**: System MUST list questions for the selected quiz and support local
  search within the loaded set.
- **FR-005**: System MUST create and edit a question together with its options in
  one form flow.
- **FR-006**: System MUST validate option correctness and unique display order at
  the schema layer.
- **FR-007**: System MUST support drag-and-drop reorder for loaded questions.
- **FR-008**: System MUST reconcile stored quiz question totals when the UI
  detects drift.
- **FR-009**: System MUST require confirmation before quiz or question
  deactivation.

### Key Entities *(include if feature involves data)*

- **Quiz**: content container with category, difficulty, score, time limit,
  status, and question count
- **Question**: quiz item with text, explanation, type, difficulty, score, and
  display order
- **Question Option**: answer choice with correctness and display order

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Admin can create and edit quizzes without leaving `/content/quizzes`.
- **SC-002**: Admin can create, edit, deactivate, and reorder questions from
  `/content/questions`.
- **SC-003**: Question options are validated before save and stale options are
  removed correctly.
- **SC-004**: Quiz counts stay aligned with question data after content changes.

## Assumptions

- Question search is client-side against the currently loaded quiz only.
- Rich text, image uploads, and advanced media handling are not part of the
  current implementation.
