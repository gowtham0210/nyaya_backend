import { z } from 'zod';

export const QUIZ_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export const QUESTION_TYPES = ['single_choice', 'multiple_choice', 'true_false'] as const;

export const categorySchema = z.object({
  name: z.string().min(2, 'Category name must be at least 2 characters'),
  slug: z.string().min(2, 'Slug is required'),
  description: z.string().optional().nullable(),
  isActive: z.boolean(),
});

export const quizSchema = z.object({
  categoryId: z.coerce.number().positive('Choose a category'),
  title: z.string().min(3, 'Quiz title must be at least 3 characters'),
  slug: z.string().min(2, 'Slug is required'),
  description: z.string().optional().nullable(),
  difficulty: z.enum(QUIZ_DIFFICULTIES),
  timeLimitSeconds: z
    .union([z.coerce.number().min(0, 'Time limit must be zero or more'), z.null()])
    .optional(),
  passingScore: z.coerce.number().min(0, 'Passing score cannot be negative'),
  isActive: z.boolean(),
});

export const optionSchema = z.object({
  id: z.number().optional(),
  optionText: z.string().min(1, 'Option text is required'),
  isCorrect: z.boolean(),
  displayOrder: z.coerce.number().int().positive('Display order must be at least 1'),
});

const questionShape = {
  quizId: z.coerce.number().positive('Choose a quiz'),
  questionText: z.string().min(5, 'Question text must be at least 5 characters'),
  questionType: z.enum(QUESTION_TYPES),
  explanation: z.string().optional().nullable(),
  difficulty: z.enum(QUIZ_DIFFICULTIES),
  pointsReward: z.coerce.number().min(0, 'Points reward cannot be negative'),
  negativePoints: z.coerce.number().min(0, 'Negative points cannot be negative'),
  displayOrder: z.coerce.number().int().positive('Display order must be at least 1'),
  isActive: z.boolean(),
  options: z.array(optionSchema).min(2, 'Add at least two answer options'),
};

function applyQuestionRules(value, context) {
  const correctCount = value.options.filter((option) => option.isCorrect).length;

  if (correctCount === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Mark at least one option as correct',
      path: ['options'],
    });
  }

  if (value.questionType === 'single_choice' || value.questionType === 'true_false') {
    if (correctCount !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Single choice questions require exactly one correct option',
        path: ['options'],
      });
    }
  }

  const displayOrders = new Set<number>();

  for (const [index, option] of value.options.entries()) {
    if (displayOrders.has(option.displayOrder)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Option display orders must be unique',
        path: ['options', index, 'displayOrder'],
      });
    }

    displayOrders.add(option.displayOrder);
  }
}

export const questionSchema = z.object(questionShape).superRefine(applyQuestionRules);

export const levelSchema = z
  .object({
    code: z.string().min(2, 'Code is required'),
    name: z.string().min(2, 'Level name is required'),
    minPoints: z.coerce.number().int().min(0, 'Minimum points cannot be negative'),
    maxPoints: z.coerce.number().int().min(0, 'Maximum points cannot be negative'),
    badgeIcon: z.string().optional().nullable(),
    rewardDescription: z.string().optional().nullable(),
  })
  .refine((value) => value.maxPoints >= value.minPoints, {
    message: 'Maximum points must be greater than or equal to minimum points',
    path: ['maxPoints'],
  });

export const bulkQuestionSchema = z
  .object({
    questionText: questionShape.questionText,
    questionType: questionShape.questionType,
    explanation: questionShape.explanation,
    difficulty: questionShape.difficulty,
    pointsReward: questionShape.pointsReward,
    negativePoints: questionShape.negativePoints,
    displayOrder: questionShape.displayOrder,
    isActive: questionShape.isActive,
    options: questionShape.options,
  })
  .superRefine(applyQuestionRules);

export const categoryDefaults = {
  name: '',
  slug: '',
  description: '',
  isActive: true,
};

export const quizDefaults = {
  categoryId: 0,
  title: '',
  slug: '',
  description: '',
  difficulty: 'medium' as const,
  timeLimitSeconds: null,
  passingScore: 0,
  isActive: true,
};

export const questionDefaults = {
  quizId: 0,
  questionText: '',
  questionType: 'single_choice' as const,
  explanation: '',
  difficulty: 'medium' as const,
  pointsReward: 10,
  negativePoints: 0,
  displayOrder: 1,
  isActive: true,
  options: [
    { optionText: '', isCorrect: true, displayOrder: 1 },
    { optionText: '', isCorrect: false, displayOrder: 2 },
  ],
};

export const levelDefaults = {
  code: '',
  name: '',
  minPoints: 0,
  maxPoints: 100,
  badgeIcon: '',
  rewardDescription: '',
};

export const bulkTemplateQuestions = [
  {
    questionText: 'Which Article of the Constitution guarantees equality before law?',
    questionType: 'single_choice',
    explanation: 'Article 14 guarantees equality before the law and equal protection of laws.',
    difficulty: 'medium',
    pointsReward: 10,
    negativePoints: 0,
    displayOrder: 1,
    isActive: true,
    options: [
      { optionText: 'Article 14', isCorrect: true, displayOrder: 1 },
      { optionText: 'Article 19', isCorrect: false, displayOrder: 2 },
      { optionText: 'Article 21', isCorrect: false, displayOrder: 3 },
      { optionText: 'Article 32', isCorrect: false, displayOrder: 4 },
    ],
  },
];
