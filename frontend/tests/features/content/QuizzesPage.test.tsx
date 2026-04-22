import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmProvider } from '@/app/providers/ConfirmProvider';
import { QuizzesPage } from '@/features/content/QuizzesPage';
import { Category, Quiz } from '@/lib/types';
import * as contentApi from '@/features/content/api';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/features/content/api', () => ({
  getCategories: vi.fn(),
  getQuizzes: vi.fn(),
  saveQuiz: vi.fn(),
  deactivateQuiz: vi.fn(),
}));

const constitutionalLaw: Category = {
  id: 1,
  name: 'Constitutional Law',
  slug: 'constitutional-law',
  description: 'Foundational rights and duties',
  isActive: true,
  createdAt: '2026-04-20T10:00:00.000Z',
  updatedAt: '2026-04-21T10:00:00.000Z',
};

const caseLaw: Category = {
  id: 2,
  name: 'Case Law',
  slug: 'case-law',
  description: 'Landmark judgments',
  isActive: true,
  createdAt: '2026-04-19T10:00:00.000Z',
  updatedAt: '2026-04-20T10:00:00.000Z',
};

const rightsQuiz: Quiz = {
  id: 11,
  categoryId: 1,
  title: 'Fundamental Rights Basics',
  slug: 'fundamental-rights-basics',
  description: 'Core constitutional protections',
  difficulty: 'medium',
  totalQuestions: 8,
  timeLimitSeconds: 900,
  passingScore: 60,
  isActive: true,
  createdAt: '2026-04-20T10:00:00.000Z',
  updatedAt: '2026-04-21T10:00:00.000Z',
};

const archivedQuiz: Quiz = {
  id: 12,
  categoryId: 2,
  title: 'Legacy Procedure Archive',
  slug: 'legacy-procedure-archive',
  description: 'Older procedural references',
  difficulty: 'hard',
  totalQuestions: 5,
  timeLimitSeconds: null,
  passingScore: 70,
  isActive: false,
  createdAt: '2026-04-18T10:00:00.000Z',
  updatedAt: '2026-04-19T10:00:00.000Z',
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

function renderQuizzesPage() {
  const queryClient = createQueryClient();
  const user = userEvent.setup();

  return {
    user,
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ConfirmProvider>
          <QuizzesPage />
        </ConfirmProvider>
      </QueryClientProvider>
    ),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('QuizzesPage', () => {
  it('shows a loading state before quizzes arrive', async () => {
    let resolveRequest: ((value: Quiz[]) => void) | undefined;
    const pendingRequest = new Promise<Quiz[]>((resolve) => {
      resolveRequest = resolve;
    });

    vi.mocked(contentApi.getCategories).mockResolvedValue([constitutionalLaw, caseLaw]);
    vi.mocked(contentApi.getQuizzes).mockReturnValue(pendingRequest as never);

    renderQuizzesPage();

    expect(screen.getByText('Loading quizzes...')).toBeInTheDocument();

    resolveRequest?.([rightsQuiz]);

    await waitFor(() => {
      expect(screen.queryByText('Loading quizzes...')).not.toBeInTheDocument();
    });
  });

  it('lists quiz metadata and supports category, search, and inactive filtering', async () => {
    vi.mocked(contentApi.getCategories).mockResolvedValue([constitutionalLaw, caseLaw]);
    vi.mocked(contentApi.getQuizzes).mockImplementation(async ({ categoryId, showInactive }) => {
      const visibleQuizzes = showInactive ? [rightsQuiz, archivedQuiz] : [rightsQuiz];

      return categoryId ? visibleQuizzes.filter((quiz) => quiz.categoryId === categoryId) : visibleQuizzes;
    });

    const { user } = renderQuizzesPage();

    await screen.findByText('Fundamental Rights Basics');

    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getByText('Difficulty')).toBeInTheDocument();
    expect(screen.getByText('Questions')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getAllByText('Constitutional Law').length).toBeGreaterThan(0);
    expect(screen.getByText('medium')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.queryByText('Legacy Procedure Archive')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filter quizzes by category'), '2');

    await waitFor(() => {
      expect(vi.mocked(contentApi.getQuizzes)).toHaveBeenLastCalledWith({ categoryId: 2, showInactive: false });
    });

    expect(screen.getByText('No quizzes found')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /show inactive/i }));

    await screen.findByText('Legacy Procedure Archive');
    expect(vi.mocked(contentApi.getQuizzes)).toHaveBeenLastCalledWith({ categoryId: 2, showInactive: true });

    await user.type(screen.getByPlaceholderText('Search quizzes'), 'legacy');

    expect(screen.getByText('Legacy Procedure Archive')).toBeInTheDocument();
    expect(screen.queryByText('Fundamental Rights Basics')).not.toBeInTheDocument();
  });

  it('creates and edits quizzes through the validated side sheet', async () => {
    vi.mocked(contentApi.getCategories).mockResolvedValue([constitutionalLaw, caseLaw]);
    vi.mocked(contentApi.getQuizzes).mockResolvedValue([rightsQuiz]);
    vi.mocked(contentApi.saveQuiz).mockResolvedValue(rightsQuiz);

    const { user, queryClient } = renderQuizzesPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await screen.findByText('Fundamental Rights Basics');

    await user.click(screen.getByRole('button', { name: 'Create quiz' }));
    await screen.findByRole('heading', { name: 'Create quiz' });
    await user.type(screen.getByLabelText('Quiz title'), 'Directive Principles Mastery');
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await user.selectOptions(screen.getByLabelText('Category'), '1');
    await user.type(screen.getByLabelText('Description'), 'Long-form quiz for directive principles');
    await user.clear(screen.getByLabelText('Passing score'));
    await user.type(screen.getByLabelText('Passing score'), '75');

    expect(screen.getByLabelText('Slug')).toHaveValue('directive-principles-mastery');

    await user.click(screen.getAllByRole('button', { name: 'Create quiz' }).at(-1)!);

    await waitFor(() => {
      expect(contentApi.saveQuiz).toHaveBeenCalledWith(null, {
        categoryId: 1,
        title: 'Directive Principles Mastery',
        slug: 'directive-principles-mastery',
        description: 'Long-form quiz for directive principles',
        difficulty: 'medium',
        totalQuestions: 0,
        timeLimitSeconds: 0,
        passingScore: 75,
        isActive: true,
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['quizzes'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dashboard-summary'] });

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Create quiz' })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    await screen.findByRole('heading', { name: 'Edit quiz' });
    const quizTitleInput = await screen.findByDisplayValue('Fundamental Rights Basics');
    expect(quizTitleInput).toBeInTheDocument();
    expect(screen.getByDisplayValue('fundamental-rights-basics')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Core constitutional protections')).toBeInTheDocument();

    await user.clear(quizTitleInput);
    await user.type(quizTitleInput, 'Fundamental Rights Advanced');
    await user.click(screen.getByRole('button', { name: 'Update quiz' }));

    await waitFor(() => {
      expect(contentApi.saveQuiz).toHaveBeenCalledWith(11, {
        categoryId: 1,
        title: 'Fundamental Rights Advanced',
        slug: 'fundamental-rights-basics',
        description: 'Core constitutional protections',
        difficulty: 'medium',
        totalQuestions: 8,
        timeLimitSeconds: 900,
        passingScore: 60,
        isActive: true,
      });
    });
  });

  it('requires confirmation before deactivating a quiz and invalidates related queries after approval', async () => {
    vi.mocked(contentApi.getCategories).mockResolvedValue([constitutionalLaw, caseLaw]);
    vi.mocked(contentApi.getQuizzes).mockResolvedValue([rightsQuiz]);
    vi.mocked(contentApi.deactivateQuiz).mockResolvedValue(undefined);

    const { user, queryClient } = renderQuizzesPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await screen.findByText('Fundamental Rights Basics');

    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(screen.getByText('Deactivate "Fundamental Rights Basics"?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(contentApi.deactivateQuiz).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    await user.click(screen.getByRole('button', { name: 'Deactivate quiz' }));

    await waitFor(() => {
      expect(vi.mocked(contentApi.deactivateQuiz).mock.calls[0]?.[0]).toBe(11);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['quizzes'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dashboard-summary'] });
  });
});
