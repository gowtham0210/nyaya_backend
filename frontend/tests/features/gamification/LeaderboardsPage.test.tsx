import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LeaderboardsPage } from '@/features/gamification/LeaderboardsPage';
import { Category, LeaderboardEntry } from '@/lib/types';
import * as gamificationApi from '@/features/gamification/api';
import * as utils from '@/lib/utils';

vi.mock('@/features/gamification/api', () => ({
  getActiveCategoriesForLeaderboard: vi.fn(),
  getLeaderboard: vi.fn(),
}));

vi.mock('@/lib/utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils')>('@/lib/utils');

  return {
    ...actual,
    createCsv: vi.fn(() => 'csv-content'),
    downloadTextFile: vi.fn(),
  };
});

const constitutionalLaw: Category = {
  id: 1,
  name: 'Constitutional Law',
  slug: 'constitutional-law',
  description: 'Foundational rights and duties',
  isActive: true,
  createdAt: '2026-04-20T10:00:00.000Z',
  updatedAt: '2026-04-21T10:00:00.000Z',
};

const globalLeader: LeaderboardEntry = {
  rank: 1,
  userId: 10,
  fullName: 'Asha Menon',
  totalPoints: 5400,
  currentLevelId: 3,
};

const weeklyLeader: LeaderboardEntry = {
  rank: 1,
  userId: 11,
  fullName: 'Rahul Iyer',
  totalPoints: 850,
  currentLevelId: 2,
};

const categoryLeader: LeaderboardEntry = {
  rank: 1,
  userId: 12,
  fullName: 'Leela Thomas',
  totalPoints: 1320,
  currentLevelId: 2,
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

function renderLeaderboardsPage() {
  const queryClient = createQueryClient();
  const user = userEvent.setup();

  return {
    user,
    ...render(
      <QueryClientProvider client={queryClient}>
        <LeaderboardsPage />
      </QueryClientProvider>
    ),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  cleanup();
});

describe('LeaderboardsPage', () => {
  it('shows a loading state before leaderboard data arrives', async () => {
    let resolveRequest: ((value: LeaderboardEntry[]) => void) | undefined;
    const pendingRequest = new Promise<LeaderboardEntry[]>((resolve) => {
      resolveRequest = resolve;
    });

    vi.mocked(gamificationApi.getActiveCategoriesForLeaderboard).mockResolvedValue([constitutionalLaw]);
    vi.mocked(gamificationApi.getLeaderboard).mockReturnValue(pendingRequest as never);

    renderLeaderboardsPage();

    expect(screen.getByText('Loading leaderboard...')).toBeInTheDocument();

    resolveRequest?.([globalLeader]);

    await waitFor(() => {
      expect(screen.queryByText('Loading leaderboard...')).not.toBeInTheDocument();
    });
  });

  it('supports scope switching, limit filters, category leaderboards, and CSV export', async () => {
    vi.mocked(gamificationApi.getActiveCategoriesForLeaderboard).mockResolvedValue([constitutionalLaw]);
    vi.mocked(gamificationApi.getLeaderboard).mockImplementation(async ({ scope, categoryId }) => {
      if (scope === 'weekly') {
        return [weeklyLeader];
      }

      if (scope === 'category' && categoryId === constitutionalLaw.id) {
        return [categoryLeader];
      }

      return [globalLeader];
    });

    const { user } = renderLeaderboardsPage();

    await screen.findByText('Asha Menon');

    expect(gamificationApi.getLeaderboard).toHaveBeenCalledWith({
      scope: 'global',
      limit: 10,
      categoryId: null,
    });
    expect(screen.getByRole('option', { name: 'Top 10' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Top 25' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Top 50' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Top 100' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Leaderboard limit'), '25');

    await waitFor(() => {
      expect(gamificationApi.getLeaderboard).toHaveBeenLastCalledWith({
        scope: 'global',
        limit: 25,
        categoryId: null,
      });
    });

    await user.click(screen.getByRole('button', { name: 'Weekly' }));

    await screen.findByText('Rahul Iyer');
    await waitFor(() => {
      expect(gamificationApi.getLeaderboard).toHaveBeenLastCalledWith({
        scope: 'weekly',
        limit: 25,
        categoryId: null,
      });
    });

    await user.click(screen.getByRole('button', { name: 'By category' }));

    expect(screen.getByText('Choose a category to load this leaderboard')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Leaderboard category'), '1');

    await screen.findByText('Leela Thomas');
    await waitFor(() => {
      expect(gamificationApi.getLeaderboard).toHaveBeenLastCalledWith({
        scope: 'category',
        limit: 25,
        categoryId: 1,
      });
    });

    await user.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(utils.createCsv).toHaveBeenCalledWith([
      {
        rank: 1,
        fullName: 'Leela Thomas',
        totalPoints: 1320,
        currentLevelId: 2,
      },
    ]);
    expect(utils.downloadTextFile).toHaveBeenCalledWith(
      'leaderboard-category.csv',
      'csv-content',
      'text/csv;charset=utf-8'
    );
  });

  it('shows an empty state when the selected leaderboard has no entries', async () => {
    vi.mocked(gamificationApi.getActiveCategoriesForLeaderboard).mockResolvedValue([constitutionalLaw]);
    vi.mocked(gamificationApi.getLeaderboard).mockResolvedValue([]);

    renderLeaderboardsPage();

    await screen.findByText('No leaderboard data found');

    expect(screen.getByText('No leaderboard data found')).toBeInTheDocument();
  });
});
