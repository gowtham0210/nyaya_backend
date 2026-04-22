# Feature Specification: Bulk Question Import

**Feature Branch**: `005-bulk-question-import`  
**Created**: 2026-04-22  
**Status**: Implemented (Reverse Engineered)  
**Input**: Existing four-step bulk import wizard launched from the questions
route.

## Affected Surface Area *(mandatory)*

- **Routes / Pages**: modal launched from `/content/questions`
- **Feature Modules**: `src/features/content/BulkImportWizard.tsx`,
  `src/features/content/api.ts`, `src/features/content/schemas.ts`
- **Queries / Mutations / APIs**: question create flow reused through
  `saveQuestionWithOptions`
- **Forms / Schemas**: `bulkQuestionSchema`, import mapping state
- **Auth / Permissions**: protected admin flow; requires a selected quiz

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin uploads or pastes bulk question data (Priority: P1)

An admin can start from CSV, XLSX, JSON, or pasted JSON instead of creating
questions one by one.

**Why this priority**: Bulk authoring saves time when onboarding a large quiz set.

**Independent Test**: Open the wizard, upload a supported file, and confirm rows
and columns are detected.

**Acceptance Scenarios**:

1. **Given** a supported CSV, XLSX, or JSON file, **When** it is uploaded,
   **Then** the wizard detects rows and moves into column-mapping mode.
2. **Given** structured JSON with `options[]`, **When** it is loaded,
   **Then** the wizard skips most manual mapping work.

---

### User Story 2 - Admin validates rows before import (Priority: P1)

An admin can run a dry validation pass and understand exactly which rows are
ready or broken.

**Why this priority**: Bad rows should not silently pollute the question bank.

**Independent Test**: Map input columns, run validation, and confirm valid and
invalid rows are separated with row-level messages.

**Acceptance Scenarios**:

1. **Given** mapped row data, **When** validation runs,
   **Then** each row is marked valid or invalid with explicit errors.
2. **Given** mixed-quality rows, **When** the import option is reviewed,
   **Then** the admin can choose to import only valid rows.

---

### User Story 3 - Admin imports rows with progress and error reporting (Priority: P2)

An admin can execute the import and monitor row-by-row results instead of a
single pass or fail message.

**Why this priority**: Import operations need transparency and recoverability.

**Independent Test**: Start an import with both valid and failing rows and
confirm the execution table updates as work completes.

**Acceptance Scenarios**:

1. **Given** validated rows, **When** import starts, **Then** the wizard imports
   rows with up to four concurrent workers and tracks each row status.
2. **Given** one or more failed rows, **When** the import finishes,
   **Then** the admin can download a CSV error report.

### Edge Cases

- Unsupported file types
- JSON input that is not an array
- Rows with missing options or invalid scoring data
- Partial failure during import where some rows succeed

## Contracts & Data *(mandatory when backend or data is affected)*

- **Contract Source**: `saveQuestionWithOptions` and `bulkQuestionSchema`
- **Read Dependencies**: none beyond imported file contents
- **Write Dependencies**: question and option create endpoints reused row by row
- **Validation Boundary**: `bulkQuestionSchema`, mapping normalization helpers
- **Unknowns / Clarifications**: current implementation does not use a dedicated
  backend bulk endpoint

## Experience & State Coverage *(mandatory when UI is affected)*

- **Loading State**: step 4 shows in-progress statuses during import
- **Empty State**: validation and import tables each show empty-state panels when
  not yet populated
- **Error State**: parsing and import failures surface through toast messages and
  per-row execution status
- **Success / Feedback State**: imported rows are labeled success and the parent
  screen invalidates related queries on completion
- **Feature Lock / Deferral State**: wizard is disabled unless a quiz is selected

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept CSV, XLSX, JSON, and pasted JSON input.
- **FR-002**: System MUST support manual column mapping for flat row formats.
- **FR-003**: System MUST auto-detect structured JSON that already matches the
  question shape.
- **FR-004**: System MUST validate every row before import using the bulk schema.
- **FR-005**: System MUST allow import of only valid rows.
- **FR-006**: System MUST execute imports with row-level progress tracking.
- **FR-007**: System MUST produce a downloadable CSV error report for failed rows.
- **FR-008**: System MUST expose downloadable CSV and JSON templates.

### Key Entities *(include if feature involves data)*

- **Source Row**: imported row before normalization
- **Validation Row**: row plus validation status and normalized question payload
- **Import Status**: row execution state during the import step

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Admin can import questions from at least one spreadsheet-friendly
  format without writing code.
- **SC-002**: Invalid rows are visible before execution, with row-level messages.
- **SC-003**: Import results clearly distinguish success, pending, running, and
  failed rows.

## Assumptions

- The wizard currently imports by reusing the single-question create flow.
- Bulk import lives inside the questions route rather than a dedicated route.
