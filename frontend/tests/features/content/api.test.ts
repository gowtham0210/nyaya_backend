import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveQuestionWithOptions } from '@/features/content/api';
import { httpClient } from '@/lib/http-client';
import { QuestionOption } from '@/lib/types';

vi.mock('@/lib/http-client', () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const existingOptions: QuestionOption[] = [
  {
    id: 41,
    questionId: 7,
    optionText: 'Article 14',
    isCorrect: true,
    displayOrder: 1,
    createdAt: '2026-04-20T10:00:00.000Z',
  },
  {
    id: 42,
    questionId: 7,
    optionText: 'Article 19',
    isCorrect: false,
    displayOrder: 2,
    createdAt: '2026-04-20T10:00:00.000Z',
  },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('content api', () => {
  it('removes deleted options while updating a question and saves the remaining option set', async () => {
    vi.mocked(httpClient.patch).mockResolvedValue({ data: { id: 7 } } as never);
    vi.mocked(httpClient.post).mockResolvedValue({ data: { id: 7 } } as never);
    vi.mocked(httpClient.delete).mockResolvedValue({} as never);

    await saveQuestionWithOptions(
      7,
      {
        quizId: 1,
        questionText: 'Which article protects equality before law?',
        questionType: 'single_choice',
        explanation: 'Article 14 does.',
        difficulty: 'medium',
        pointsReward: 10,
        negativePoints: 0,
        displayOrder: 1,
        isActive: true,
        options: [
          {
            id: 41,
            optionText: 'Article 14',
            isCorrect: true,
            displayOrder: 1,
          },
          {
            optionText: 'Article 21',
            isCorrect: false,
            displayOrder: 2,
          },
        ],
      },
      existingOptions
    );

    expect(httpClient.patch).toHaveBeenCalledWith('/admin/questions/7', {
      questionText: 'Which article protects equality before law?',
      questionType: 'single_choice',
      explanation: 'Article 14 does.',
      difficulty: 'medium',
      pointsReward: 10,
      negativePoints: 0,
      displayOrder: 1,
      isActive: true,
    });
    expect(httpClient.delete).toHaveBeenCalledWith('/admin/options/42');
    expect(httpClient.patch).toHaveBeenCalledWith('/admin/options/41', {
      optionText: 'Article 14',
      isCorrect: true,
      displayOrder: 1,
    });
    expect(httpClient.post).toHaveBeenCalledWith('/admin/questions/7/options', {
      optionText: 'Article 21',
      isCorrect: false,
      displayOrder: 2,
    });
  });
});
