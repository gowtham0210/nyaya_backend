import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LevelsPanel } from '@/features/content/LevelsPanel';
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
  getQuestions: vi.fn(),
  saveCategory: vi.fn(),
  saveQuiz: vi.fn(),
  saveQuestionWithOptions: vi.fn(),
}));

const journey: Category = {
  id: 93,
  name: 'Legal Awareness Journey',
  slug: 'legal-awareness-journey',
  description: null,
  isActive: true,
  createdAt: '2026-09-19T10:00:00.000Z',
  updatedAt: '2026-09-19T10:00:00.000Z',
};

function levelQuiz(number: number): Quiz {
  return {
    id: 100 + number,
    categoryId: journey.id,
    title: `Level ${number}`,
    slug: `legal-awareness-level-${number}`,
    description: null,
    difficulty: 'easy',
    totalQuestions: 5,
    timeLimitSeconds: null,
    passingScore: 0,
    isActive: true,
    createdAt: '2026-09-19T10:00:00.000Z',
    updatedAt: '2026-09-19T10:00:00.000Z',
  };
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LevelsPanel />
    </QueryClientProvider>
  );
}

const bank = JSON.stringify({
  questions: [
    {
      level: 2,
      question: 'Which is the highest court in India?',
      optionA: 'High Court',
      optionB: 'District Court',
      optionC: 'Supreme Court',
      optionD: 'Consumer Court',
      correctAnswer: 'C',
      difficulty: 'easy',
      topic: 'Courts',
      explanation: 'It is the apex court.',
    },
  ],
});

describe('LevelsPanel', () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it('lists the journey levels in level order, not the API order', async () => {
    vi.mocked(contentApi.getCategories).mockResolvedValue([journey]);
    // The API returns newest first, so Level 10 comes back before Level 2.
    vi.mocked(contentApi.getQuizzes).mockResolvedValue([
      levelQuiz(10),
      levelQuiz(2),
      levelQuiz(1),
    ]);

    renderPanel();

    await waitFor(() =>
      expect(screen.getByText('legal-awareness-level-1')).toBeInTheDocument()
    );
    const rendered = screen
      .getAllByText(/^legal-awareness-level-\d+$/)
      .map((node) => node.textContent);
    expect(rendered).toEqual([
      'legal-awareness-level-1',
      'legal-awareness-level-2',
      'legal-awareness-level-10',
    ]);
  });

  it('imports a pasted question bank into the matching level', async () => {
    const user = userEvent.setup();
    vi.mocked(contentApi.getCategories).mockResolvedValue([journey]);
    vi.mocked(contentApi.getQuizzes).mockResolvedValue([levelQuiz(1), levelQuiz(2)]);
    vi.mocked(contentApi.getQuestions).mockResolvedValue({
      quiz: levelQuiz(2),
      items: [],
    });
    vi.mocked(contentApi.saveQuestionWithOptions).mockResolvedValue({} as never);
    vi.mocked(contentApi.saveQuiz).mockResolvedValue(levelQuiz(2));

    renderPanel();
    await waitFor(() => expect(screen.getByText('Level 2')).toBeInTheDocument());

    await user.upload(
      screen.getByLabelText('Questions file'),
      new File([bank], 'bank.json', { type: 'application/json' })
    );
    await user.click(await screen.findByRole('button', { name: /^Import 1 question$/ }));

    await waitFor(() =>
      expect(contentApi.saveQuestionWithOptions).toHaveBeenCalledTimes(1)
    );
    const [, payload] = vi.mocked(contentApi.saveQuestionWithOptions).mock.calls[0];
    expect(payload.quizId).toBe(levelQuiz(2).id);
    expect(payload.questionText).toBe('Which is the highest court in India?');
    expect(payload.options.filter((option) => option.isCorrect)).toHaveLength(1);
    expect(payload.options[2]).toMatchObject({
      optionText: 'Supreme Court',
      isCorrect: true,
    });
    // No new level was needed, since Level 2 already existed.
    expect(contentApi.saveCategory).not.toHaveBeenCalled();
  });

  it('refuses a bank that is missing required fields', async () => {
    const user = userEvent.setup();
    const { toast } = await import('sonner');
    vi.mocked(contentApi.getCategories).mockResolvedValue([journey]);
    vi.mocked(contentApi.getQuizzes).mockResolvedValue([levelQuiz(1)]);

    renderPanel();
    await waitFor(() => expect(screen.getByText('Level 1')).toBeInTheDocument());

    await user.upload(
      screen.getByLabelText('Questions file'),
      new File(
        ['{"questions":[{"level":1,"question":"No options here"}]}'],
        'bad.json',
        { type: 'application/json' }
      )
    );
    await user.click(await screen.findByRole('button', { name: /^Import 1 question$/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(contentApi.saveQuestionWithOptions).not.toHaveBeenCalled();
  });

  it('adds a typed question to the chosen level and keeps the count right', async () => {
    const user = userEvent.setup();
    vi.mocked(contentApi.getCategories).mockResolvedValue([journey]);
    vi.mocked(contentApi.getQuizzes).mockResolvedValue([levelQuiz(1), levelQuiz(3)]);
    // Level 3 already holds two questions, so the new one lands third.
    vi.mocked(contentApi.getQuestions).mockResolvedValue({
      quiz: levelQuiz(3),
      items: [{ id: 1 }, { id: 2 }],
    } as never);
    vi.mocked(contentApi.saveQuestionWithOptions).mockResolvedValue({} as never);
    vi.mocked(contentApi.saveQuiz).mockResolvedValue(levelQuiz(3));

    renderPanel();
    await waitFor(() =>
      expect(screen.getByText('legal-awareness-level-3')).toBeInTheDocument()
    );

    await user.selectOptions(screen.getByLabelText('Level'), '3');
    await user.type(
      screen.getByPlaceholderText('Which is the highest court in India?'),
      'Who interprets the Constitution?'
    );
    await user.type(screen.getByPlaceholderText('Answer A'), 'Parliament');
    await user.type(screen.getByPlaceholderText('Answer B'), 'The Supreme Court');
    await user.type(screen.getByPlaceholderText('Answer C'), 'The President');
    await user.type(screen.getByPlaceholderText('Answer D'), 'The Cabinet');
    await user.click(screen.getByLabelText('Option B is correct'));
    await user.selectOptions(screen.getByLabelText(/^Difficulty/), 'medium');

    await user.click(screen.getByRole('button', { name: 'Add question' }));

    await waitFor(() =>
      expect(contentApi.saveQuestionWithOptions).toHaveBeenCalledTimes(1)
    );
    const [, payload] = vi.mocked(contentApi.saveQuestionWithOptions).mock.calls[0];
    expect(payload).toMatchObject({
      quizId: levelQuiz(3).id,
      questionText: 'Who interprets the Constitution?',
      difficulty: 'medium',
      pointsReward: 15,
      displayOrder: 3,
    });
    expect(payload.options[1]).toMatchObject({
      optionText: 'The Supreme Court',
      isCorrect: true,
    });
    expect(payload.options.filter((option) => option.isCorrect)).toHaveLength(1);
    // The level now advertises three questions.
    expect(vi.mocked(contentApi.saveQuiz).mock.calls[0][1]).toMatchObject({
      totalQuestions: 3,
    });
  });

  it('will not add a question with an empty option', async () => {
    const user = userEvent.setup();
    vi.mocked(contentApi.getCategories).mockResolvedValue([journey]);
    vi.mocked(contentApi.getQuizzes).mockResolvedValue([levelQuiz(1)]);

    renderPanel();
    await waitFor(() =>
      expect(screen.getByText('legal-awareness-level-1')).toBeInTheDocument()
    );

    await user.selectOptions(screen.getByLabelText('Level'), '1');
    await user.type(
      screen.getByPlaceholderText('Which is the highest court in India?'),
      'Half-written question?'
    );
    await user.type(screen.getByPlaceholderText('Answer A'), 'Only this one');
    await user.click(screen.getByRole('button', { name: 'Add question' }));

    await waitFor(() => expect(screen.getByText('Option B is empty.')).toBeInTheDocument());
    expect(contentApi.saveQuestionWithOptions).not.toHaveBeenCalled();
  });

  it('reads a plain CSV with human column names, no mapping step', async () => {
    const user = userEvent.setup();
    vi.mocked(contentApi.getCategories).mockResolvedValue([journey]);
    vi.mocked(contentApi.getQuizzes).mockResolvedValue([levelQuiz(1), levelQuiz(4)]);
    vi.mocked(contentApi.getQuestions).mockResolvedValue({
      quiz: levelQuiz(4),
      items: [],
    } as never);
    vi.mocked(contentApi.saveQuestionWithOptions).mockResolvedValue({} as never);
    vi.mocked(contentApi.saveQuiz).mockResolvedValue(levelQuiz(4));

    // Exactly the shape of the user's own export: no level, no difficulty.
    const csv = [
      'Question,Option A,Option B,Option C,Option D,Correct Answer,Explanation',
      'Which Article guarantees equality?,Article 12,Article 14,Article 19,Article 21,B,Article 14 guarantees equality.',
    ].join('\n');

    renderPanel();
    await waitFor(() =>
      expect(screen.getByText('legal-awareness-level-4')).toBeInTheDocument()
    );

    await user.upload(
      screen.getByLabelText('Questions file'),
      new File([csv], 'law_question.csv', { type: 'text/csv' })
    );
    await user.selectOptions(screen.getByLabelText(/Add to level/), '4');
    await user.selectOptions(screen.getByLabelText(/^Default difficulty/), 'medium');
    await user.click(await screen.findByRole('button', { name: /^Import 1 question$/ }));

    await waitFor(() =>
      expect(contentApi.saveQuestionWithOptions).toHaveBeenCalledTimes(1)
    );
    const [, payload] = vi.mocked(contentApi.saveQuestionWithOptions).mock.calls[0];
    expect(payload).toMatchObject({
      quizId: levelQuiz(4).id,
      questionText: 'Which Article guarantees equality?',
      difficulty: 'medium',
    });
    // "B" resolved to the second option.
    expect(payload.options[1]).toMatchObject({
      optionText: 'Article 14',
      isCorrect: true,
    });
    expect(payload.options.filter((option) => option.isCorrect)).toHaveLength(1);
  });

  it('asks which level to use when the file has no level column', async () => {
    const user = userEvent.setup();
    vi.mocked(contentApi.getCategories).mockResolvedValue([journey]);
    vi.mocked(contentApi.getQuizzes).mockResolvedValue([levelQuiz(1)]);

    renderPanel();
    await waitFor(() =>
      expect(screen.getByText('legal-awareness-level-1')).toBeInTheDocument()
    );

    await user.upload(
      screen.getByLabelText('Questions file'),
      new File(
        ['Question,Option A,Option B,Option C,Option D,Correct Answer\nQ?,a,b,c,d,A'],
        'q.csv',
        { type: 'text/csv' }
      )
    );
    await user.click(await screen.findByRole('button', { name: /^Import 1 question$/ }));

    await waitFor(() =>
      expect(
        screen.getByText('Choose which level these questions belong to.')
      ).toBeInTheDocument()
    );
    expect(contentApi.saveQuestionWithOptions).not.toHaveBeenCalled();
  });

  it('adds the next level in the sequence', async () => {
    const user = userEvent.setup();
    vi.mocked(contentApi.getCategories).mockResolvedValue([journey]);
    vi.mocked(contentApi.getQuizzes).mockResolvedValue([levelQuiz(1), levelQuiz(2)]);
    vi.mocked(contentApi.saveQuiz).mockResolvedValue(levelQuiz(3));

    renderPanel();
    await waitFor(() =>
      expect(screen.getByText('legal-awareness-level-2')).toBeInTheDocument()
    );

    await user.selectOptions(screen.getByLabelText('New level difficulty'), 'hard');
    await user.click(screen.getByRole('button', { name: 'Add Level 3' }));

    await waitFor(() => expect(contentApi.saveQuiz).toHaveBeenCalledTimes(1));
    const [quizId, payload] = vi.mocked(contentApi.saveQuiz).mock.calls[0];
    expect(quizId).toBeNull();
    expect(payload).toMatchObject({
      categoryId: journey.id,
      title: 'Level 3',
      slug: 'legal-awareness-level-3',
      difficulty: 'hard',
      totalQuestions: 0,
      isActive: true,
    });
    // No category needed creating, since the journey already existed.
    expect(contentApi.saveCategory).not.toHaveBeenCalled();
  });

  it('starts at Level 1 when the journey has no levels yet', async () => {
    const user = userEvent.setup();
    vi.mocked(contentApi.getCategories).mockResolvedValue([]);
    vi.mocked(contentApi.getQuizzes).mockResolvedValue([]);
    vi.mocked(contentApi.saveCategory).mockResolvedValue(journey);
    vi.mocked(contentApi.saveQuiz).mockResolvedValue(levelQuiz(1));

    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Add Level 1' }));

    await waitFor(() => expect(contentApi.saveQuiz).toHaveBeenCalledTimes(1));
    // The journey category is created on the way.
    expect(contentApi.saveCategory).toHaveBeenCalledTimes(1);
    expect(vi.mocked(contentApi.saveQuiz).mock.calls[0][1]).toMatchObject({
      title: 'Level 1',
      slug: 'legal-awareness-level-1',
    });
  });
});
