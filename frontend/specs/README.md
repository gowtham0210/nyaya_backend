# Reverse-Engineered Specs

These specs describe the frontend behavior that is already implemented in this
repository as of 2026-04-22. They were reverse-engineered from the current
routes, pages, API helpers, and providers so future work can start from a clear
baseline instead of guesswork.

| Spec | Status | Routes / Surface |
|------|--------|------------------|
| [001-auth-and-admin-shell](./001-auth-and-admin-shell/spec.md) | Implemented | `/login`, `/access-denied`, all protected routes |
| [002-dashboard-overview](./002-dashboard-overview/spec.md) | Implemented | `/dashboard` |
| [003-categories-management](./003-categories-management/spec.md) | Implemented | `/content/categories` |
| [004-quizzes-and-questions-management](./004-quizzes-and-questions-management/spec.md) | Implemented | `/content/quizzes`, `/content/questions` |
| [005-bulk-question-import](./005-bulk-question-import/spec.md) | Implemented | Bulk import modal from `/content/questions` |
| [006-gamification-management](./006-gamification-management/spec.md) | Implemented | `/gamification/levels`, `/gamification/leaderboards` |
| [007-settings-and-portal-status](./007-settings-and-portal-status/spec.md) | Implemented | `/settings` |

Use these docs as the current product baseline. For new work, create a new
numbered spec instead of editing these reverse-engineered records unless the
implemented behavior itself changes.
