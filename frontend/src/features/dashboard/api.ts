import { httpClient } from '@/lib/http-client';
import { DashboardSummary } from '@/lib/types';

export async function getDashboardSummary() {
  const response = await httpClient.get<DashboardSummary>('/admin/dashboard');
  return response.data;
}
