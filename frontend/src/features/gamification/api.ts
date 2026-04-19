import { httpClient } from '@/lib/http-client';
import { Category, LeaderboardEntry, Level } from '@/lib/types';

export async function getLevels() {
  const response = await httpClient.get<{ items: Level[] }>('/levels');
  return response.data.items;
}

export async function saveLevel(levelId: number | null, payload: Omit<Level, 'id' | 'createdAt' | 'updatedAt'>) {
  const response = levelId
    ? await httpClient.patch<Level>(`/admin/levels/${levelId}`, payload)
    : await httpClient.post<Level>('/admin/levels', payload);

  return response.data;
}

export async function getLeaderboard(params: { scope: 'global' | 'weekly' | 'category'; limit: number; categoryId?: number | null }) {
  if (params.scope === 'category' && params.categoryId) {
    const response = await httpClient.get<{ items: LeaderboardEntry[] }>(
      `/leaderboards/category/${params.categoryId}?limit=${params.limit}`
    );
    return response.data.items;
  }

  const response = await httpClient.get<{ items: LeaderboardEntry[] }>(
    `/leaderboards/${params.scope}?limit=${params.limit}`
  );
  return response.data.items;
}

export async function getActiveCategoriesForLeaderboard() {
  const response = await httpClient.get<{ items: Category[] }>('/categories');
  return response.data.items;
}
