import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmProvider } from '@/app/providers/ConfirmProvider';
import { DailyQuestionsPage } from '@/features/content/DailyQuestionsPage';
import { DailyQuestion } from '@/lib/types';
import * as contentApi from '@/features/content/api';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/features/content/api', () => ({
  getDailyQuestions: vi.fn(),
  saveDailyQuestion: vi.fn(),
  deleteDailyQuestion: vi.fn(),
}));

const fraudQuestion: DailyQuestion = {
  id: 7,
  category: 'Cyber and Online Issues',
  question: "What should I do if I'm a victim of online fraud?",
  answer: 'Report it to your bank and call 1930 as soon as possible.',
  pointsReward: 10,
  options: [
    { id: 70, optionText: 'Wait a week and see', isCorrect: false, displayOrder: 1 },
    { id: 71, optionText: 'Call 1930 and inform your bank', isCorrect: true, displayOrder: 2 },
  ],
};

const legacyQuestion: DailyQuestion = {
  id: 8,
  category: 'Consumer Rights',
  question: 'Can a shop refuse a valid coin?',
  answer: 'No.',
  pointsReward: 10,
  options: [],
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const user = userEvent.setup();

  render(
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <DailyQuestionsPage />
      </ConfirmProvider>
    </QueryClientProvider>
  );

  return { user };
}

describe('DailyQuestionsPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('lists questions with their choices and flags ones that still need choices', async () => {
    vi.mocked(contentApi.getDailyQuestions).mockResolvedValue([fraudQuestion, legacyQuestion]);
    renderPage();

    expect(await screen.findByText(fraudQuestion.question)).toBeInTheDocument();
    expect(screen.getByText(/Call 1930 and inform your bank/)).toHaveClass('text-emerald-700');
    expect(screen.getByText('Needs choices')).toBeInTheDocument();
  });

  it('creates a question with choices, keeping exactly one marked correct', async () => {
    vi.mocked(contentApi.getDailyQuestions).mockResolvedValue([]);
    vi.mocked(contentApi.saveDailyQuestion).mockResolvedValue(fraudQuestion);
    const { user } = renderPage();

    await user.click(await screen.findByRole('button', { name: 'Add daily question' }));

    await user.type(screen.getByPlaceholderText('Consumer Rights'), 'Cyber');
    await user.type(
      screen.getByPlaceholderText("What should I do if I'm a victim of online fraud?"),
      'What should I do first?'
    );
    await user.type(screen.getByLabelText('Choice 1'), 'Ignore it');
    await user.type(screen.getByLabelText('Choice 2'), 'Call 1930');
    await user.type(screen.getByLabelText('Choice 3'), 'Reply to the scammer');
    await user.type(screen.getByPlaceholderText(/Why the correct choice is right/), 'Speed matters.');

    // Choice 1 starts as correct; picking choice 2 must clear it.
    const correctRadios = screen.getAllByRole('radio', { name: 'Correct' });
    await user.click(correctRadios[1]);
    expect(correctRadios[0]).not.toBeChecked();
    expect(correctRadios[1]).toBeChecked();

    const submit = screen.getByRole('button', { name: 'Add question' });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    await waitFor(() =>
      expect(contentApi.saveDailyQuestion).toHaveBeenCalledWith(null, {
        category: 'Cyber',
        question: 'What should I do first?',
        answer: 'Speed matters.',
        pointsReward: 10,
        options: [
          { id: undefined, optionText: 'Ignore it', isCorrect: false },
          { id: undefined, optionText: 'Call 1930', isCorrect: true },
          { id: undefined, optionText: 'Reply to the scammer', isCorrect: false },
        ],
      })
    );
  });

  it('sends existing option ids back when editing, so past answers stay linked', async () => {
    vi.mocked(contentApi.getDailyQuestions).mockResolvedValue([fraudQuestion]);
    vi.mocked(contentApi.saveDailyQuestion).mockResolvedValue(fraudQuestion);
    const { user } = renderPage();

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const firstChoice = screen.getByLabelText('Choice 1');
    await user.clear(firstChoice);
    await user.type(firstChoice, 'Wait and see');

    const submit = screen.getByRole('button', { name: 'Update question' });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    await waitFor(() => expect(contentApi.saveDailyQuestion).toHaveBeenCalled());
    const [id, payload] = vi.mocked(contentApi.saveDailyQuestion).mock.calls[0];
    expect(id).toBe(7);
    expect(payload.options).toEqual([
      { id: 70, optionText: 'Wait and see', isCorrect: false },
      { id: 71, optionText: 'Call 1930 and inform your bank', isCorrect: true },
    ]);
  });
});
