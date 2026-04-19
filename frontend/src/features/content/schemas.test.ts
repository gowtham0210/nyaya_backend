import { describe, expect, it } from 'vitest';
import { bulkQuestionSchema, questionSchema } from '@/features/content/schemas';

describe('content schemas', () => {
  it('accepts a valid single-choice question with one correct option', () => {
    const result = questionSchema.safeParse({
      quizId: 1,
      questionText: 'Which article guarantees equality before law?',
      questionType: 'single_choice',
      explanation: 'Article 14 does.',
      difficulty: 'medium',
      pointsReward: 10,
      negativePoints: 0,
      displayOrder: 1,
      isActive: true,
      options: [
        { optionText: 'Article 14', isCorrect: true, displayOrder: 1 },
        { optionText: 'Article 19', isCorrect: false, displayOrder: 2 },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('rejects single-choice questions with multiple correct answers', () => {
    const result = bulkQuestionSchema.safeParse({
      questionText: 'Pick the correct article',
      questionType: 'single_choice',
      explanation: '',
      difficulty: 'medium',
      pointsReward: 10,
      negativePoints: 0,
      displayOrder: 1,
      isActive: true,
      options: [
        { optionText: 'Article 14', isCorrect: true, displayOrder: 1 },
        { optionText: 'Article 21', isCorrect: true, displayOrder: 2 },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.message.includes('exactly one correct option'))).toBe(true);
  });
});
