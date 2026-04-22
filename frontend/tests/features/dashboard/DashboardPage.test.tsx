import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { httpClient } from '@/lib/http-client';
import { DashboardSummary } from '@/lib/types';

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

function renderDashboard() {
  const queryClient = createQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <DashboardPage />
    </QueryClientProvider>
  );
}

function createDashboardSummary(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
    stats: {
      activeCategories: 4,
      totalCategories: 5,
      activeQuizzes: 12,
      totalQuizzes: 14,
      activeQuestions: 48,
      totalQuestions: 50,
      totalLevels: 3,
      attemptsToday: 21,
      activeUsers7d: 17,
      activeUsers30d: 42,
    },
    topQuizzes: [
      {
        id: 10,
        title: 'Fundamental Rights Basics',
        slug: 'fundamental-rights-basics',
        totalAttempts: 120,
        submittedAttempts: 95,
      },
    ],
    leaderboardPreview: [
      {
        rank: 1,
        userId: 99,
        fullName: 'Asha Menon',
        totalPoints: 5000,
        currentLevelId: 3,
      },
    ],
    recentQuestions: [
      {
        id: 1,
        questionText: 'Which article guarantees equality before law?',
        quizId: 10,
        quizTitle: 'Fundamental Rights Basics',
        createdAt: '2026-04-20T10:00:00.000Z',
      },
    ],
    recentAttempts: [
      {
        id: 3,
        status: 'submitted',
        quizId: 10,
        quizTitle: 'Fundamental Rights Basics',
        userId: 99,
        fullName: 'Asha Menon',
        startedAt: '2026-04-20T10:00:00.000Z',
        createdAt: '2026-04-20T10:15:00.000Z',
      },
    ],
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('DashboardPage', () => {
  it('requests the dashboard summary and renders the implemented overview widgets', async () => {
    const summary = createDashboardSummary();
    const getSpy = vi.spyOn(httpClient, 'get').mockResolvedValue({ data: summary } as never);

    renderDashboard();

    await screen.findByText('Asha Menon');

    expect(getSpy).toHaveBeenCalledWith('/admin/dashboard');
    expect(screen.getByText('Active categories')).toBeInTheDocument();
    expect(screen.getByText('Active quizzes')).toBeInTheDocument();
    expect(screen.getByText('Active questions')).toBeInTheDocument();
    expect(screen.getByText('Attempts today')).toBeInTheDocument();
    expect(screen.getByText('Levels configured')).toBeInTheDocument();
    expect(screen.getByText('Top quizzes by attempts')).toBeInTheDocument();
    expect(screen.getByText('Global leaderboard preview')).toBeInTheDocument();
    expect(screen.getByText('Recently added questions')).toBeInTheDocument();
    expect(screen.getByText('Recent quiz attempts')).toBeInTheDocument();
    expect(screen.getByText('Asha Menon')).toBeInTheDocument();
    expect(screen.getAllByText('Fundamental Rights Basics').length).toBeGreaterThanOrEqual(2);
  });

  it('shows a loading state for dashboard panels before the first response arrives', async () => {
    let resolveRequest: ((value: { data: DashboardSummary }) => void) | undefined;
    const pendingRequest = new Promise<{ data: DashboardSummary }>((resolve) => {
      resolveRequest = resolve;
    });

    vi.spyOn(httpClient, 'get').mockReturnValue(pendingRequest as never);

    renderDashboard();

    expect(screen.getAllByText('Loading dashboard data...')).toHaveLength(4);
    expect(screen.getByText('Refreshing')).toBeInTheDocument();

    resolveRequest?.({ data: createDashboardSummary() });

    await waitFor(() => {
      expect(screen.queryByText('Loading dashboard data...')).not.toBeInTheDocument();
    });
  });

  it('renders empty states when dashboard collections are absent', async () => {
    const summary = createDashboardSummary({
      topQuizzes: [],
      leaderboardPreview: [],
      recentQuestions: [],
      recentAttempts: [],
    });

    vi.spyOn(httpClient, 'get').mockResolvedValue({ data: summary } as never);

    renderDashboard();

    await screen.findByText('No quiz attempt data yet');

    expect(screen.getByText('No quiz attempt data yet')).toBeInTheDocument();
    expect(screen.getByText('No leaderboard data yet')).toBeInTheDocument();
    expect(screen.getByText('No recent questions')).toBeInTheDocument();
    expect(screen.getByText('No recent attempts')).toBeInTheDocument();
  });
});
