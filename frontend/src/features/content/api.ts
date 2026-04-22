import { httpClient } from '@/lib/http-client';
import { Category, Question, QuestionOption, Quiz } from '@/lib/types';

export type BulkCategoryMutationResult = {
  successIds: number[];
  failures: Array<{
    id: number;
    error: unknown;
  }>;
};

export type QuestionFormPayload = {
  quizId: number;
  questionText: string;
  questionType: string;
  explanation?: string | null;
  difficulty: string;
  pointsReward: number;
  negativePoints: number;
  displayOrder: number;
  isActive: boolean;
  options: Array<{
    id?: number;
    optionText: string;
    isCorrect: boolean;
    displayOrder: number;
  }>;
};

export async function getCategories(showInactive = false) {
  const response = await httpClient.get<{ items: Category[] }>(
    showInactive ? '/admin/categories' : '/admin/categories?active=true'
  );
  return response.data.items;
}

export async function saveCategory(categoryId: number | null, payload: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>) {
  const response = categoryId
    ? await httpClient.patch<Category>(`/admin/categories/${categoryId}`, payload)
    : await httpClient.post<Category>('/admin/categories', payload);

  return response.data;
}

export async function deactivateCategory(categoryId: number) {
  await httpClient.delete(`/admin/categories/${categoryId}`);
}

export async function updateCategoryStatus(categoryId: number, isActive: boolean) {
  const response = await httpClient.patch<Category>(`/admin/categories/${categoryId}`, {
    isActive,
  });

  return response.data;
}

async function settleCategoryMutations(
  categoryIds: number[],
  mutation: (categoryId: number) => Promise<unknown>
): Promise<BulkCategoryMutationResult> {
  if (!categoryIds.length) {
    return {
      successIds: [],
      failures: [],
    };
  }

  const settledResults = await Promise.allSettled(categoryIds.map((categoryId) => mutation(categoryId)));

  return settledResults.reduce<BulkCategoryMutationResult>(
    (result, settled, index) => {
      const categoryId = categoryIds[index];

      if (settled.status === 'fulfilled') {
        result.successIds.push(categoryId);
      } else {
        result.failures.push({
          id: categoryId,
          error: settled.reason,
        });
      }

      return result;
    },
    {
      successIds: [],
      failures: [],
    }
  );
}

export async function bulkDeleteCategories(categoryIds: number[]) {
  return settleCategoryMutations(categoryIds, deactivateCategory);
}

export async function bulkUpdateCategoryStatus(categoryIds: number[], isActive: boolean) {
  return settleCategoryMutations(categoryIds, (categoryId) => updateCategoryStatus(categoryId, isActive));
}

export async function getQuizzes(params: { categoryId?: number | null; showInactive?: boolean }) {
  const query = new URLSearchParams();

  if (params.categoryId) {
    query.set('categoryId', String(params.categoryId));
  }

  if (!params.showInactive) {
    query.set('active', 'true');
  }

  const response = await httpClient.get<{ items: Quiz[] }>(`/admin/quizzes?${query.toString()}`);
  return response.data.items;
}

export async function saveQuiz(quizId: number | null, payload: Omit<Quiz, 'id' | 'createdAt' | 'updatedAt' | 'totalQuestions'> & { totalQuestions: number }) {
  const response = quizId
    ? await httpClient.patch<Quiz>(`/admin/quizzes/${quizId}`, payload)
    : await httpClient.post<Quiz>('/admin/quizzes', payload);

  return response.data;
}

export async function deactivateQuiz(quizId: number) {
  await httpClient.delete(`/admin/quizzes/${quizId}`);
}

export async function getQuestions(quizId: number, showInactive = false) {
  const path = showInactive
    ? `/admin/quizzes/${quizId}/questions`
    : `/admin/quizzes/${quizId}/questions?active=true`;
  const response = await httpClient.get<{ quiz: Quiz; items: Question[] }>(path);
  return response.data;
}

export async function saveQuestionWithOptions(
  questionId: number | null,
  payload: QuestionFormPayload,
  existingOptions: QuestionOption[] = []
) {
  const questionResponse = questionId
    ? await httpClient.patch<Question>(`/admin/questions/${questionId}`, {
        questionText: payload.questionText,
        questionType: payload.questionType,
        explanation: payload.explanation || null,
        difficulty: payload.difficulty,
        pointsReward: payload.pointsReward,
        negativePoints: payload.negativePoints,
        displayOrder: payload.displayOrder,
        isActive: payload.isActive,
      })
    : await httpClient.post<Question>('/admin/questions', {
        quizId: payload.quizId,
        questionText: payload.questionText,
        questionType: payload.questionType,
        explanation: payload.explanation || null,
        difficulty: payload.difficulty,
        pointsReward: payload.pointsReward,
        negativePoints: payload.negativePoints,
        displayOrder: payload.displayOrder,
        isActive: payload.isActive,
      });

  const savedQuestion = questionResponse.data;
  const nextQuestionId = savedQuestion.id;
  const nextOptionIds = new Set(payload.options.filter((option) => option.id).map((option) => option.id));

  await Promise.all(
    existingOptions
      .filter((option) => !nextOptionIds.has(option.id))
      .map((option) => httpClient.delete(`/admin/options/${option.id}`))
  );

  for (const option of payload.options) {
    if (option.id) {
      await httpClient.patch<QuestionOption>(`/admin/options/${option.id}`, {
        optionText: option.optionText,
        isCorrect: option.isCorrect,
        displayOrder: option.displayOrder,
      });
      continue;
    }

    await httpClient.post<QuestionOption>(`/admin/questions/${nextQuestionId}/options`, {
      optionText: option.optionText,
      isCorrect: option.isCorrect,
      displayOrder: option.displayOrder,
    });
  }

  return savedQuestion;
}

export async function deactivateQuestion(questionId: number) {
  await httpClient.delete(`/admin/questions/${questionId}`);
}

export async function reorderQuestions(questions: Array<{ id: number; displayOrder: number }>) {
  await Promise.all(
    questions.map((question) =>
      httpClient.patch(`/admin/questions/${question.id}`, {
        displayOrder: question.displayOrder,
      })
    )
  );
}

export async function reconcileQuizQuestionCount(quizId: number, totalQuestions: number) {
  await httpClient.patch(`/admin/quizzes/${quizId}`, {
    totalQuestions,
  });
}
