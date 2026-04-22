import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LevelsPage } from '@/features/gamification/LevelsPage';
import { Level } from '@/lib/types';
import * as gamificationApi from '@/features/gamification/api';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/features/gamification/api', () => ({
  getLevels: vi.fn(),
  saveLevel: vi.fn(),
}));

const bronzeLevel: Level = {
  id: 1,
  code: 'bronze',
  name: 'Bronze',
  minPoints: 0,
  maxPoints: 199,
  badgeIcon: 'shield',
  rewardDescription: 'Welcome tier',
  createdAt: '2026-04-20T10:00:00.000Z',
  updatedAt: '2026-04-21T10:00:00.000Z',
};

const silverLevel: Level = {
  id: 2,
  code: 'silver',
  name: 'Silver',
  minPoints: 200,
  maxPoints: 499,
  badgeIcon: 'star',
  rewardDescription: 'Priority recognition',
  createdAt: '2026-04-21T10:00:00.000Z',
  updatedAt: '2026-04-22T10:00:00.000Z',
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

function renderLevelsPage() {
  const queryClient = createQueryClient();
  const user = userEvent.setup();

  return {
    user,
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <LevelsPage />
      </QueryClientProvider>
    ),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  cleanup();
});

describe('LevelsPage', () => {
  it('shows a loading state before levels arrive', async () => {
    let resolveRequest: ((value: Level[]) => void) | undefined;
    const pendingRequest = new Promise<Level[]>((resolve) => {
      resolveRequest = resolve;
    });

    vi.mocked(gamificationApi.getLevels).mockReturnValue(pendingRequest as never);

    renderLevelsPage();

    expect(screen.getAllByText('Loading levels...')).toHaveLength(2);

    resolveRequest?.([bronzeLevel]);

    await waitFor(() => {
      expect(screen.queryByText('Loading levels...')).not.toBeInTheDocument();
    });
  });

  it('renders the level ladder preview and handles create and edit flows with schema validation', async () => {
    vi.mocked(gamificationApi.getLevels).mockResolvedValue([bronzeLevel, silverLevel]);
    vi.mocked(gamificationApi.saveLevel).mockResolvedValue(silverLevel);

    const { user, queryClient } = renderLevelsPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await screen.findAllByText('Bronze');

    expect(screen.getByText('Level ladder preview')).toBeInTheDocument();
    expect(screen.getAllByText('Silver').length).toBeGreaterThan(0);
    expect(screen.getByText('0 to 199 points')).toBeInTheDocument();
    expect(screen.getByText('200 to 499 points')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create level' }));
    await screen.findByRole('heading', { name: 'Create level' });
    const [minPointsInput, maxPointsInput] = screen.getAllByRole('spinbutton');
    const codeInput = screen.getByPlaceholderText('bronze');
    const nameInput = screen.getByPlaceholderText('Bronze');
    const badgeInput = screen.getByPlaceholderText('shield');
    const rewardInput = screen.getByPlaceholderText('Describe the perk or recognition for this level.');

    await user.type(codeInput, 'gold');
    await user.type(nameInput, 'Gold');
    await user.clear(minPointsInput);
    await user.type(minPointsInput, '500');
    await user.clear(maxPointsInput);
    await user.type(maxPointsInput, '400');

    expect(await screen.findByText('Maximum points must be greater than or equal to minimum points')).toBeInTheDocument();

    await user.clear(maxPointsInput);
    await user.type(maxPointsInput, '999');
    await user.type(badgeInput, 'crown');
    await user.type(rewardInput, 'Premium moderation perks');
    await user.click(screen.getAllByRole('button', { name: 'Create level' }).at(-1)!);

    await waitFor(() => {
      expect(gamificationApi.saveLevel).toHaveBeenCalledWith(null, {
        code: 'gold',
        name: 'Gold',
        minPoints: 500,
        maxPoints: 999,
        badgeIcon: 'crown',
        rewardDescription: 'Premium moderation perks',
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['levels'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dashboard-summary'] });

    await user.click(screen.getAllByRole('button', { name: 'Edit' }).at(0)!);

    expect(await screen.findByDisplayValue('bronze')).toBeInTheDocument();
    const editNameInput = screen.getByDisplayValue('Bronze');
    expect(editNameInput).toBeInTheDocument();
    expect(screen.getByDisplayValue('shield')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Welcome tier')).toBeInTheDocument();

    await user.clear(editNameInput);
    await user.type(editNameInput, 'Bronze Plus');
    await user.click(screen.getByRole('button', { name: 'Update level' }));

    await waitFor(() => {
      expect(gamificationApi.saveLevel).toHaveBeenCalledWith(1, {
        code: 'bronze',
        name: 'Bronze Plus',
        minPoints: 0,
        maxPoints: 199,
        badgeIcon: 'shield',
        rewardDescription: 'Welcome tier',
      });
    });
  });

  it('shows empty states when no levels are configured yet', async () => {
    vi.mocked(gamificationApi.getLevels).mockResolvedValue([]);

    renderLevelsPage();

    await screen.findByText('No levels configured yet');

    expect(screen.getByText('No levels configured yet')).toBeInTheDocument();
    expect(screen.getByText('No levels found')).toBeInTheDocument();
  });
});
