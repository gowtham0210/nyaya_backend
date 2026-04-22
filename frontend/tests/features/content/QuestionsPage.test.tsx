import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmProvider } from '@/app/providers/ConfirmProvider';
import { QuestionsPage } from '@/features/content/QuestionsPage';
import { Category, Question, Quiz } from '@/lib/types';
import * as contentApi from '@/features/content/api';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/features/content/BulkImportWizard', () => ({
  BulkImportWizard: () => null,
}));

vi.mock('@/features/content/api', () => ({
  deactivateQuestion: vi.fn(),
  getCategories: vi.fn(),
  getQuestions: vi.fn(),
  getQuizzes: vi.fn(),
  reconcileQuizQuestionCount: vi.fn(),
  reorderQuestions: vi.fn(),
  saveQuestionWithOptions: vi.fn(),
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

const rightsQuiz: Quiz = {
  id: 11,
  categoryId: 1,
  title: 'Fundamental Rights Basics',
  slug: 'fundamental-rights-basics',
  description: 'Core constitutional protections',
  difficulty: 'medium',
  totalQuestions: 3,
  timeLimitSeconds: 900,
  passingScore: 60,
  isActive: true,
  createdAt: '2026-04-20T10:00:00.000Z',
  updatedAt: '2026-04-21T10:00:00.000Z',
};

const firstQuestion: Question = {
  id: 101,
  quizId: 11,
  questionText: 'Which article guarantees equality before law?',
  questionType: 'single_choice',
  explanation: 'Article 14 covers equality before law.',
  difficulty: 'medium',
  pointsReward: 10,
  negativePoints: 0,
  displayOrder: 1,
  isActive: true,
  createdAt: '2026-04-20T10:00:00.000Z',
  updatedAt: '2026-04-21T10:00:00.000Z',
  options: [
    {
      id: 1001,
      questionId: 101,
      optionText: 'Article 14',
      isCorrect: true,
      displayOrder: 1,
      createdAt: '2026-04-20T10:00:00.000Z',
    },
    {
      id: 1002,
      questionId: 101,
      optionText: 'Article 19',
      isCorrect: false,
      displayOrder: 2,
      createdAt: '2026-04-20T10:00:00.000Z',
    },
  ],
};

const secondQuestion: Question = {
  id: 102,
  quizId: 11,
  questionText: 'Which remedy protects personal liberty?',
  questionType: 'single_choice',
  explanation: 'Habeas corpus protects liberty.',
  difficulty: 'easy',
  pointsReward: 10,
  negativePoints: 0,
  displayOrder: 2,
  isActive: true,
  createdAt: '2026-04-20T11:00:00.000Z',
  updatedAt: '2026-04-21T11:00:00.000Z',
  options: [
    {
      id: 1003,
      questionId: 102,
      optionText: 'Habeas corpus',
      isCorrect: true,
      displayOrder: 1,
      createdAt: '2026-04-20T11:00:00.000Z',
    },
    {
      id: 1004,
      questionId: 102,
      optionText: 'Mandamus',
      isCorrect: false,
      displayOrder: 2,
      createdAt: '2026-04-20T11:00:00.000Z',
    },
  ],
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

function renderQuestionsPage() {
  const queryClient = createQueryClient();
  const user = userEvent.setup();

  return {
    user,
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ConfirmProvider>
          <QuestionsPage />
        </ConfirmProvider>
      </QueryClientProvider>
    ),
  };
}

function mockQuestionsPageData(overrides?: {
  categories?: Category[];
  quizzes?: Quiz[];
  questions?: Question[];
  quiz?: Quiz;
}) {
  vi.mocked(contentApi.getCategories).mockResolvedValue(overrides?.categories || [constitutionalLaw]);
  vi.mocked(contentApi.getQuizzes).mockImplementation(async ({ categoryId }) =>
    categoryId === constitutionalLaw.id ? overrides?.quizzes || [rightsQuiz] : []
  );
  vi.mocked(contentApi.getQuestions).mockResolvedValue({
    quiz: overrides?.quiz || rightsQuiz,
    items: overrides?.questions || [firstQuestion, secondQuestion],
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('QuestionsPage', () => {
  it('shows a loading state before the required selections and questions arrive', async () => {
    let resolveRequest: ((value: Category[]) => void) | undefined;
    const pendingCategories = new Promise<Category[]>((resolve) => {
      resolveRequest = resolve;
    });

    vi.mocked(contentApi.getCategories).mockReturnValue(pendingCategories as never);
    vi.mocked(contentApi.getQuizzes).mockResolvedValue([rightsQuiz]);
    vi.mocked(contentApi.getQuestions).mockResolvedValue({
      quiz: rightsQuiz,
      items: [firstQuestion, secondQuestion],
    });

    renderQuestionsPage();

    expect(screen.getByText('Loading questions...')).toBeInTheDocument();

    resolveRequest?.([constitutionalLaw]);

    await waitFor(() => {
      expect(screen.queryByText('Loading questions...')).not.toBeInTheDocument();
    });
  });

  it('lists questions for the selected quiz, supports local search, and reconciles stored counts', async () => {
    vi.mocked(contentApi.reconcileQuizQuestionCount).mockResolvedValue(undefined);
    mockQuestionsPageData();

    const { user } = renderQuestionsPage();

    await screen.findByText('Which article guarantees equality before law?');

    expect(screen.getAllByText('Fundamental Rights Basics').length).toBeGreaterThan(0);
    expect(screen.getByText('Saved count 3 / loaded 2')).toBeInTheDocument();

    await waitFor(() => {
      expect(contentApi.reconcileQuizQuestionCount).toHaveBeenCalledWith(11, 2);
    });

    await user.type(screen.getByPlaceholderText('Search questions'), 'liberty');

    expect(screen.getByText('Which remedy protects personal liberty?')).toBeInTheDocument();
    expect(screen.queryByText('Which article guarantees equality before law?')).not.toBeInTheDocument();
  });

  it('creates and edits questions with options in one form flow', async () => {
    vi.mocked(contentApi.saveQuestionWithOptions).mockResolvedValue(firstQuestion);
    vi.mocked(contentApi.reconcileQuizQuestionCount).mockResolvedValue(undefined);
    mockQuestionsPageData();

    const { user, queryClient } = renderQuestionsPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await screen.findByText('Which article guarantees equality before law?');

    await user.click(screen.getByRole('button', { name: 'Create question' }));
    await screen.findByRole('heading', { name: 'Create question' });
    await user.type(screen.getByLabelText('Question text'), 'Which article protects freedom of speech?');
    await user.type(screen.getByLabelText('Explanation'), 'Article 19 protects speech and expression.');
    await user.type(screen.getByLabelText('Option 1'), 'Article 19');
    await user.type(screen.getByLabelText('Option 2'), 'Article 32');
    await user.click(screen.getAllByRole('button', { name: 'Create question' }).at(-1)!);

    await waitFor(() => {
      expect(contentApi.saveQuestionWithOptions).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          quizId: 11,
          questionText: 'Which article protects freedom of speech?',
          explanation: 'Article 19 protects speech and expression.',
          questionType: 'single_choice',
          difficulty: 'medium',
          pointsReward: 10,
          negativePoints: 0,
          displayOrder: 3,
          isActive: true,
          options: [
            expect.objectContaining({
              optionText: 'Article 19',
              isCorrect: true,
              displayOrder: 1,
            }),
            expect.objectContaining({
              optionText: 'Article 32',
              isCorrect: false,
              displayOrder: 2,
            }),
          ],
        }),
        []
      );
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['questions'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['quizzes'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dashboard-summary'] });

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Create question' })).not.toBeInTheDocument();
    });

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    await screen.findByRole('heading', { name: 'Edit question' });
    const questionTextInput = await screen.findByDisplayValue('Which article guarantees equality before law?');
    expect(questionTextInput).toBeInTheDocument();
    expect(screen.getByDisplayValue('Article 14')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Article 19')).toBeInTheDocument();

    await user.clear(questionTextInput);
    await user.type(questionTextInput, 'Which article protects equality?');
    await user.click(screen.getByRole('button', { name: 'Remove option 2' }));
    await user.click(screen.getByRole('button', { name: 'Add option' }));
    await user.type(screen.getAllByPlaceholderText('Option text').at(-1)!, 'Article 21');
    await user.click(screen.getByRole('button', { name: 'Update question' }));

    await waitFor(() => {
      expect(contentApi.saveQuestionWithOptions).toHaveBeenCalledTimes(2);
    });

    const updateCall = vi.mocked(contentApi.saveQuestionWithOptions).mock.calls[1];
    expect(updateCall?.[0]).toBe(101);
    expect(updateCall?.[2]).toEqual(firstQuestion.options);
    expect(updateCall?.[1].questionText).toBe('Which article protects equality?');
    expect(updateCall?.[1].options.some((option) => option.id === 1002)).toBe(false);
    expect(updateCall?.[1].options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 1001, optionText: 'Article 14', isCorrect: true, displayOrder: 1 }),
        expect.objectContaining({ optionText: 'Article 21', isCorrect: false, displayOrder: 2 }),
      ])
    );
  });

  it('reorders loaded questions with normalized display order', async () => {
    vi.mocked(contentApi.reconcileQuizQuestionCount).mockResolvedValue(undefined);
    vi.mocked(contentApi.reorderQuestions).mockResolvedValue(undefined);
    mockQuestionsPageData({
      quiz: { ...rightsQuiz, totalQuestions: 2 },
    });

    const { container } = renderQuestionsPage();

    await screen.findByText('Which remedy protects personal liberty?');

    const draggableCards = Array.from(container.querySelectorAll('[draggable="true"]'));
    fireEvent.dragStart(draggableCards[0]);
    fireEvent.dragOver(draggableCards[1]);
    fireEvent.drop(draggableCards[1]);

    await waitFor(() => {
      expect(vi.mocked(contentApi.reorderQuestions).mock.calls[0]?.[0]).toEqual([
        { id: 102, displayOrder: 1 },
        { id: 101, displayOrder: 2 },
      ]);
    });
  });

  it('requires confirmation before deactivating a question and invalidates related queries after approval', async () => {
    vi.mocked(contentApi.deactivateQuestion).mockResolvedValue(undefined);
    vi.mocked(contentApi.reconcileQuizQuestionCount).mockResolvedValue(undefined);
    mockQuestionsPageData();

    const { user, queryClient } = renderQuestionsPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await screen.findByText('Which article guarantees equality before law?');

    await user.click(screen.getAllByRole('button', { name: 'Deactivate' })[0]);
    expect(screen.getByText('Deactivate this question?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(contentApi.deactivateQuestion).not.toHaveBeenCalled();

    await user.click(screen.getAllByRole('button', { name: 'Deactivate' })[0]);
    await user.click(screen.getByRole('button', { name: 'Deactivate question' }));

    await waitFor(() => {
      expect(vi.mocked(contentApi.deactivateQuestion).mock.calls[0]?.[0]).toBe(101);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['questions'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['quizzes'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dashboard-summary'] });
  });
});
