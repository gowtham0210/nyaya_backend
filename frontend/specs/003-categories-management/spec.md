# Feature Specification: Categories Management

**Feature Branch**: `003-categories-management`  
**Created**: 2026-04-22  
**Status**: Updated (Bulk Actions Planned)  
**Input**: Existing category list, create/edit sheet, search, and requested bulk
selection with bulk delete and bulk status-change actions.

## Affected Surface Area *(mandatory)*

- **Routes / Pages**: `/content/categories`
- **Feature Modules**: `src/features/content/CategoriesPage.tsx`,
  `src/features/content/api.ts`, `src/features/content/schemas.ts`
- **Queries / Mutations / APIs**: `GET /admin/categories`,
  `POST /admin/categories`, `PATCH /admin/categories/{id}`,
  `DELETE /admin/categories/{id}`, plus a bulk action workflow that can delete
  or update the status of multiple selected categories in one admin action
- **Forms / Schemas**: `categorySchema`, bulk selection state, bulk action
  confirmation flow
- **Auth / Permissions**: protected admin route

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin reviews, filters, and selects categories (Priority: P1)

An admin can view the category list, search it locally, choose whether to
include inactive records, and select one or more categories for bulk actions.

**Why this priority**: Editors need category visibility before they can manage
quizzes under them, and selection is the entry point for bulk maintenance.

**Independent Test**: Open `/content/categories`, search for a known category,
toggle inactive visibility, select one row, then use select-all on the visible
results.

**Acceptance Scenarios**:

1. **Given** categories exist, **When** the page loads, **Then** the table shows
   selection controls, name, slug, status, updated time, and actions.
2. **Given** the admin enters a search term or toggles inactive visibility,
   **When** filters change, **Then** the table reflects the matching records.
3. **Given** visible category rows, **When** the admin selects one or more rows
   or uses select-all for the current result set, **Then** the UI shows the
   selected state and the selected count without leaving the page.

---

### User Story 2 - Admin creates or updates a category (Priority: P1)

An admin can open a side sheet, validate the form, and save category details.

**Why this priority**: Category maintenance is a core content-management task.

**Independent Test**: Create a new category and edit an existing one through the
sheet form.

**Acceptance Scenarios**:

1. **Given** the create action is selected, **When** valid form data is
   submitted, **Then** the app creates a category and refreshes the category list.
2. **Given** an existing category, **When** the edit sheet is opened,
   **Then** existing values are loaded and can be updated successfully.

---

### User Story 3 - Admin performs bulk actions on categories (Priority: P1)

An admin can select multiple categories and perform one action for the whole
selection, including delete, mark active, or mark inactive.

**Why this priority**: Bulk actions remove repetitive row-by-row work for common
admin maintenance tasks.

**Independent Test**: Select multiple categories and trigger each bulk action
path, verifying both confirm and cancel behavior.

**Acceptance Scenarios**:

1. **Given** one or more categories are selected, **When** bulk delete is
   confirmed, **Then** the selected categories are deleted and relevant queries
   are invalidated.
2. **Given** one or more categories are selected, **When** the admin chooses
   bulk mark active or bulk mark inactive, **Then** every applicable selected
   category is updated to the requested status.
3. **Given** a bulk action confirmation is cancelled, **When** the dialog
   closes, **Then** no bulk mutation is sent and the selection remains.

---

### User Story 4 - Admin manages a single category safely (Priority: P2)

An admin can still manage an individual category from its row actions without
having to enter bulk mode first.

**Why this priority**: Single-item editing and lifecycle control remain useful
for small adjustments and preserve current behavior.

**Independent Test**: Use the existing row-level edit and deactivate/delete
actions on one category.

**Acceptance Scenarios**:

1. **Given** a category row, **When** its edit action is selected,
   **Then** the existing category values load into the sheet for update.
2. **Given** a category row, **When** its destructive action is confirmed,
   **Then** only that category is changed and related queries refresh.

### Edge Cases

- Search term matches slug or description rather than name
- Category has no description
- Inactive categories should still be editable when visible
- Selected rows fall out of the filtered result after a bulk status change
- Mixed active and inactive categories are selected for one bulk status action
- One or more categories fail during a bulk action while others succeed
- Bulk actions are attempted with no selected rows

## Contracts & Data *(mandatory when backend or data is affected)*

- **Contract Source**: `src/features/content/api.ts`, `src/lib/types.ts`
- **Read Dependencies**: `GET /admin/categories`, optional `?active=true`
- **Write Dependencies**: `POST /admin/categories`,
  `PATCH /admin/categories/{id}`, `DELETE /admin/categories/{id}`, and bulk
  category actions executed across the selected category set
- **Validation Boundary**: `categorySchema`
- **Unknowns / Clarifications**: bulk delete uses the category delete capability;
  if the backend treats delete as a soft-delete/deactivation, the admin
  experience should still communicate the final resulting status clearly

## Experience & State Coverage *(mandatory when UI is affected)*

- **Loading State**: table area waits on query result while the rest of the page
  remains interactive, and bulk controls are disabled while a bulk mutation is
  processing
- **Empty State**: dedicated empty-state card when no categories match
- **Error State**: single or bulk mutation failures surface through toast
  errors, with partial-failure feedback when only some selected categories
  succeed
- **Success / Feedback State**: create, update, delete, and status-change
  actions show success toasts, including the affected count for bulk actions
- **Feature Lock / Deferral State**: not applicable

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST list categories on `/content/categories`.
- **FR-002**: System MUST support client-side search across name, slug, and
  description.
- **FR-003**: System MUST support a toggle to include inactive categories.
- **FR-004**: System MUST let admins select individual category rows and select
  all currently visible rows for bulk actions.
- **FR-005**: System MUST show bulk action controls only when at least one
  category is selected and MUST display the number of selected categories.
- **FR-006**: System MUST support bulk delete for the current selection.
- **FR-007**: System MUST support bulk status changes that mark the current
  selection active or inactive.
- **FR-008**: System MUST require explicit confirmation before destructive
  delete actions.
- **FR-009**: System MUST preserve row-level category management so admins can
  still edit or manage a single category directly from the table.
- **FR-010**: System MUST provide a create/edit sheet backed by
  `categorySchema`.
- **FR-011**: System MUST support slug generation from the category name.
- **FR-012**: System MUST invalidate relevant cached queries after single or
  bulk mutations.
- **FR-013**: System MUST provide success and error feedback for bulk actions,
  including partial-failure reporting when some selected categories cannot be
  processed.

### Key Entities *(include if feature involves data)*

- **Category**: top-level content grouping with name, slug, description, status,
  and timestamps

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Admin can select multiple categories and complete delete, activate,
  or deactivate actions from `/content/categories` without repeating the action
  row by row.
- **SC-002**: Category search, inactive filtering, and row selection work
  together without leaving the page.
- **SC-003**: Single and bulk category mutations refresh related content
  queries cleanly.
- **SC-004**: Bulk actions return clear feedback about how many selected
  categories succeeded or failed.

## Assumptions

- Category counts or quiz relationships are not displayed on this page today.
- The server is responsible for persistent category storage and timestamps.
- Bulk selection applies to the categories currently loaded in the visible list,
  not to records that are not yet loaded into the table.
- Existing create/edit behavior remains unchanged while bulk management is added
  to the list experience.
