import { AppProviders } from '@/app/providers/AppProviders';
import { AppRoutes } from '@/app/routes';

export function App() {
  return (
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  );
}
