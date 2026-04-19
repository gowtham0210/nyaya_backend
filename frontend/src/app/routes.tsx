import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/app/layout/AppShell';
import { RequireAdmin, RequireAuth } from '@/app/providers/AuthProvider';
import { LoginPage } from '@/features/auth/LoginPage';
import { AccessDeniedPage } from '@/features/auth/AccessDeniedPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { CategoriesPage } from '@/features/content/CategoriesPage';
import { QuizzesPage } from '@/features/content/QuizzesPage';
import { QuestionsPage } from '@/features/content/QuestionsPage';
import { LevelsPage } from '@/features/gamification/LevelsPage';
import { LeaderboardsPage } from '@/features/gamification/LeaderboardsPage';
import { FeatureLockedPage } from '@/features/placeholders/FeatureLockedPage';
import { SettingsPage } from '@/features/settings/SettingsPage';

function AdminLayout() {
  return (
    <RequireAuth>
      <RequireAdmin>
        <AppShell>
          <Outlet />
        </AppShell>
      </RequireAdmin>
    </RequireAuth>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/access-denied" element={<AccessDeniedPage />} />

      <Route element={<AdminLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/content/categories" element={<CategoriesPage />} />
        <Route path="/content/quizzes" element={<QuizzesPage />} />
        <Route path="/content/questions" element={<QuestionsPage />} />
        <Route path="/gamification/levels" element={<LevelsPage />} />
        <Route path="/gamification/leaderboards" element={<LeaderboardsPage />} />
        <Route
          path="/users"
          element={
            <FeatureLockedPage
              title="Users module is waiting on admin-scoped API endpoints"
              description="The portal shell is ready, but this page stays locked until /admin/users and related progress endpoints are available."
            />
          }
        />
        <Route
          path="/attempts"
          element={
            <FeatureLockedPage
              title="Attempts module is waiting on admin/global attempt APIs"
              description="The roadmap reserves this area for global quiz-attempt investigation once admin filters and drill-down endpoints are available."
            />
          }
        />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
