# Nyaya Admin Portal Roadmap

This roadmap is reverse-engineered from the current frontend codebase. It is a
clear inventory of what is already shipped, what is only partial, and what is
still blocked or locked. It replaces the older aspirational roadmap that no
longer matched the implementation.

## Status Legend

- `Implemented`: working in the current frontend
- `Partial`: visible in UI but not fully wired
- `Locked`: route exists but intentionally blocked
- `Planned`: not implemented yet

## Current Product Baseline

| Feature | Status | Routes / Surface | Spec / Source of Truth | Notes |
|---------|--------|------------------|------------------------|-------|
| Auth and admin shell | Implemented | `/login`, `/access-denied`, all protected routes | [001-auth-and-admin-shell](./specs/001-auth-and-admin-shell/spec.md) | Includes login, boot-time refresh, role guards, logout, sidebar shell, top bar |
| Dashboard overview | Implemented | `/dashboard` | [002-dashboard-overview](./specs/002-dashboard-overview/spec.md) | KPI cards, top quizzes, leaderboard preview, recent questions, recent attempts |
| Categories management | Implemented | `/content/categories` | [003-categories-management](./specs/003-categories-management/spec.md) | Search, show inactive, create, edit, deactivate |
| Quizzes management | Implemented | `/content/quizzes` | [004-quizzes-and-questions-management](./specs/004-quizzes-and-questions-management/spec.md) | Category filter, search, create, edit, deactivate |
| Questions management | Implemented | `/content/questions` | [004-quizzes-and-questions-management](./specs/004-quizzes-and-questions-management/spec.md) | Category and quiz filters, create, edit, option editing, deactivate, drag reorder |
| Bulk question import | Implemented | Modal from `/content/questions` | [005-bulk-question-import](./specs/005-bulk-question-import/spec.md) | CSV, XLSX, JSON, pasted JSON, validation, row-by-row import, error report |
| Levels management | Implemented | `/gamification/levels` | [006-gamification-management](./specs/006-gamification-management/spec.md) | Ladder preview plus create and edit |
| Leaderboards viewer | Implemented | `/gamification/leaderboards` | [006-gamification-management](./specs/006-gamification-management/spec.md) | Global, weekly, category scopes plus CSV export |
| Settings and portal status | Implemented | `/settings` | [007-settings-and-portal-status](./specs/007-settings-and-portal-status/spec.md) | Read-only session and environment details |
| Top bar search | Partial | Present in shell top bar | Code only | UI input exists, but no search behavior is wired yet |
| Manual token login | Partial | `/login?devMode=1` | [001-auth-and-admin-shell](./specs/001-auth-and-admin-shell/spec.md) | Debug-only path, not part of normal production flow |
| Users module | Locked | `/users` | Route placeholder only | Intentionally blocked pending admin user endpoints |
| Attempts module | Locked | `/attempts` | Route placeholder only | Intentionally blocked pending admin attempt endpoints |

## Completed Features

- [x] Dedicated login route with admin-only access control
- [x] Session restore and token refresh flow
- [x] Routed admin shell with sidebar navigation and top bar
- [x] Dashboard summary
- [x] Categories CRUD-style management
- [x] Quizzes CRUD-style management
- [x] Questions CRUD-style management
- [x] Bulk question import wizard
- [x] Levels management
- [x] Leaderboards viewer and CSV export
- [x] Settings and environment visibility page

## Locked or Incomplete Features

- [ ] Users management and user detail workflows
- [ ] Attempts investigation workflows
- [ ] Functional global search from the top bar
- [ ] Rich media question authoring such as image upload
- [ ] Dedicated backend bulk import endpoint
- [ ] Generated API client beyond the current typed helpers

## Recommended Next Roadmap Order

1. **Users management foundation**
   - Status: Locked
   - Why next: it unlocks one of the visible placeholder routes and completes the
     operations section.
   - Backend dependency: admin-scoped user list and user detail endpoints.

2. **Attempts investigation**
   - Status: Locked
   - Why next: it complements dashboard activity and gives admins drill-down into
     learner behavior.
   - Backend dependency: admin-scoped attempt filters and detail endpoints.

3. **Top bar search**
   - Status: Partial
   - Why next: the search box is already visible, so users will expect it to do
     something useful.
   - Suggested scope: route search, module search, or current-page record search.

4. **Question media support**
   - Status: Planned
   - Why next: it extends the strongest existing content workflow instead of
     starting a new module from scratch.
   - Backend dependency: upload endpoint or a signed-upload strategy.

5. **Contract and test hardening**
   - Status: Planned
   - Why next: it reduces regressions as more modules are added.
   - Suggested scope: stronger API contract generation, more route tests, more
     schema and auth coverage.

## How to Use This Roadmap

- Treat `specs/` as the source of truth for implemented behavior.
- For any new feature, write a new spec first instead of editing this roadmap
  directly.
- Update the feature's status here only after the code is actually shipped in the
  frontend.
