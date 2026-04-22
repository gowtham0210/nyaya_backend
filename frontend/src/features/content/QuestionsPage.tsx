import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GripVertical, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  deactivateQuestion,
  getCategories,
  getQuestions,
  getQuizzes,
  reconcileQuizQuestionCount,
  reorderQuestions,
  saveQuestionWithOptions,
} from '@/features/content/api';
import { BulkImportWizard } from '@/features/content/BulkImportWizard';
import { QUESTION_TYPES, QUIZ_DIFFICULTIES, questionDefaults, questionSchema } from '@/features/content/schemas';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { Field } from '@/components/shared/Field';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Sheet } from '@/components/ui/Sheet';
import { Textarea } from '@/components/ui/Textarea';
import { Question } from '@/lib/types';
import { formatDateTime, getErrorMessage } from '@/lib/utils';

type QuestionFormValues = z.infer<typeof questionSchema>;

export function QuestionsPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [quizId, setQuizId] = useState<number | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [orderedQuestions, setOrderedQuestions] = useState<Question[]>([]);
  const [draggedQuestionId, setDraggedQuestionId] = useState<number | null>(null);
  const reconciliationRef = useRef<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ['categories', { showInactive: false }],
    queryFn: () => getCategories(false),
  });

  const quizzesQuery = useQuery({
    queryKey: ['quizzes', { categoryId, showInactive }],
    queryFn: () => getQuizzes({ categoryId, showInactive }),
    enabled: Boolean(categoryId),
  });

  const questionsQuery = useQuery({
    queryKey: ['questions', { quizId, showInactive }],
    queryFn: () => getQuestions(Number(quizId), showInactive),
    enabled: Boolean(quizId),
  });

  const form = useForm<QuestionFormValues>({
    resolver: zodResolver(questionSchema),
    defaultValues: questionDefaults as QuestionFormValues,
    mode: 'onChange',
  });
  const optionFields = useFieldArray({
    control: form.control,
    name: 'options',
  });

  const saveMutation = useMutation({
    mutationFn: (values: QuestionFormValues) =>
      saveQuestionWithOptions(editingQuestion?.id || null, values as any, editingQuestion?.options || []),
    onSuccess: () => {
      toast.success(editingQuestion ? 'Question updated.' : 'Question created.');
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      queryClient.invalidateQueries({ queryKey: ['quizzes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      setSheetOpen(false);
      setEditingQuestion(null);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: deactivateQuestion,
    onSuccess: () => {
      toast.success('Question deactivated.');
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      queryClient.invalidateQueries({ queryKey: ['quizzes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const reorderMutation = useMutation({
    mutationFn: reorderQuestions,
    onSuccess: () => {
      toast.success('Question order updated.');
      queryClient.invalidateQueries({ queryKey: ['questions'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const reconcileMutation = useMutation({
    mutationFn: ({ quizId: nextQuizId, totalQuestions }: { quizId: number; totalQuestions: number }) =>
      reconcileQuizQuestionCount(nextQuizId, totalQuestions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quizzes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });

  useEffect(() => {
    if (!categoryId && categoriesQuery.data?.length) {
      setCategoryId(categoriesQuery.data[0].id);
    }
  }, [categoriesQuery.data, categoryId]);

  useEffect(() => {
    if (!quizzesQuery.data?.length) {
      setQuizId(null);
      return;
    }

    if (!quizId || !quizzesQuery.data.some((quiz) => quiz.id === quizId)) {
      setQuizId(quizzesQuery.data[0].id);
    }
  }, [quizId, quizzesQuery.data]);

  useEffect(() => {
    if (questionsQuery.data?.items) {
      setOrderedQuestions(questionsQuery.data.items);
    }
  }, [questionsQuery.data]);

  useEffect(() => {
    const questionData = questionsQuery.data;

    if (!questionData?.quiz) {
      return;
    }

    const actualCount = questionData.items.length;
    const currentCount = questionData.quiz.totalQuestions;
    const syncKey = `${questionData.quiz.id}:${actualCount}`;

    if (actualCount !== currentCount && reconciliationRef.current !== syncKey) {
      reconciliationRef.current = syncKey;
      reconcileMutation.mutate({
        quizId: questionData.quiz.id,
        totalQuestions: actualCount,
      });
    }
  }, [questionsQuery.data, reconcileMutation]);

  const filteredQuestions = useMemo(() => {
    return orderedQuestions.filter((question) => {
      const haystack = `${question.questionText} ${question.explanation || ''} ${question.questionType}`.toLowerCase();
      return haystack.includes(search.toLowerCase());
    });
  }, [orderedQuestions, search]);
  const isSelectionBootstrapping =
    (categoriesQuery.isPending && !categoriesQuery.data) ||
    (!categoryId && Boolean(categoriesQuery.data?.length)) ||
    (Boolean(categoryId) && quizzesQuery.isPending && !quizzesQuery.data) ||
    (Boolean(categoryId) && !quizId && Boolean(quizzesQuery.data?.length));
  const isInitialQuestionLoading = Boolean(quizId) && questionsQuery.isPending && !questionsQuery.data;
  const isLoadingState = isSelectionBootstrapping || isInitialQuestionLoading;

  const selectedQuiz = quizzesQuery.data?.find((quiz) => quiz.id === quizId) || questionsQuery.data?.quiz;

  function resetQuestionForm(displayOrder = (questionsQuery.data?.items.length || 0) + 1) {
    form.reset({
      ...questionDefaults,
      quizId: Number(quizId || 0),
      displayOrder,
      options: [
        { optionText: '', isCorrect: true, displayOrder: 1 },
        { optionText: '', isCorrect: false, displayOrder: 2 },
      ],
    } as QuestionFormValues);
    setEditingQuestion(null);
  }

  function openCreateSheet() {
    if (!quizId) {
      toast.error('Select a quiz before creating questions.');
      return;
    }

    resetQuestionForm((questionsQuery.data?.items.length || 0) + 1);
    setSheetOpen(true);
  }

  function openEditSheet(question: Question) {
    setEditingQuestion(question);
    form.reset({
      quizId: question.quizId,
      questionText: question.questionText,
      questionType: question.questionType as any,
      explanation: question.explanation || '',
      difficulty: question.difficulty as any,
      pointsReward: question.pointsReward,
      negativePoints: question.negativePoints,
      displayOrder: question.displayOrder,
      isActive: question.isActive,
      options: question.options.map((option) => ({
        id: option.id,
        optionText: option.optionText,
        isCorrect: option.isCorrect,
        displayOrder: option.displayOrder,
      })),
    } as QuestionFormValues);
    setSheetOpen(true);
  }

  async function handleDeactivate(question: Question) {
    const approved = await confirm({
      title: 'Deactivate this question?',
      description: 'The question will remain in the database but stop appearing as an active record.',
      confirmText: 'Deactivate question',
      tone: 'danger',
    });

    if (approved) {
      deleteMutation.mutate(question.id);
    }
  }

  function onDropQuestion(targetId: number) {
    if (!draggedQuestionId || draggedQuestionId === targetId) {
      return;
    }

    const nextOrder = [...orderedQuestions];
    const sourceIndex = nextOrder.findIndex((question) => question.id === draggedQuestionId);
    const targetIndex = nextOrder.findIndex((question) => question.id === targetId);

    if (sourceIndex === -1 || targetIndex === -1) {
      return;
    }

    const [movedQuestion] = nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(targetIndex, 0, movedQuestion);
    const normalized = nextOrder.map((question, index) => ({
      ...question,
      displayOrder: index + 1,
    }));

    setOrderedQuestions(normalized);
    reorderMutation.mutate(normalized.map((question) => ({ id: question.id, displayOrder: question.displayOrder })));
    setDraggedQuestionId(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Content"
        title="Questions"
        description="Manage every question and its answer options, reorder the quiz flow, and run validated bulk imports."
        actionLabel="Create question"
        onAction={openCreateSheet}
      >
        <Select
          className="sm:w-52"
          aria-label="Filter questions by category"
          value={categoryId || ''}
          onChange={(event) => setCategoryId(event.target.value ? Number(event.target.value) : null)}
        >
          <option value="">Choose category</option>
          {(categoriesQuery.data || []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>

        <Select
          className="sm:w-64"
          aria-label="Select quiz"
          value={quizId || ''}
          onChange={(event) => setQuizId(event.target.value ? Number(event.target.value) : null)}
        >
          <option value="">Choose quiz</option>
          {(quizzesQuery.data || []).map((quiz) => (
            <option key={quiz.id} value={quiz.id}>
              {quiz.title}
            </option>
          ))}
        </Select>

        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">
          <Checkbox checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
          Show inactive
        </label>

        <Input
          className="w-full sm:w-72"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search questions"
        />

        <Button variant="secondary" onClick={() => setBulkOpen(true)} disabled={!quizId}>
          <Upload className="mr-2 h-4 w-4" />
          Bulk import
        </Button>
      </PageHeader>

      {selectedQuiz ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge>{selectedQuiz.title}</Badge>
            <Badge tone="muted">{selectedQuiz.difficulty}</Badge>
            {questionsQuery.data ? (
              <Badge tone={questionsQuery.data.quiz.totalQuestions === filteredQuestions.length ? 'success' : 'warning'}>
                Saved count {questionsQuery.data.quiz.totalQuestions} / loaded {questionsQuery.data.items.length}
              </Badge>
            ) : (
              <Badge tone="muted">Loading question totals...</Badge>
            )}
          </div>
          <p className="mt-3 text-sm text-slate-500">
            {questionsQuery.data
              ? 'Drag questions by the grip handle to reorder them. Question totals are reconciled silently in the background.'
              : 'Fetching the latest question set for this quiz.'}
          </p>
        </Card>
      ) : null}

      <div className="space-y-4">
        {isLoadingState ? (
          <EmptyState
            title="Loading questions..."
            description="Fetching the available quizzes and question records for the current selection."
          />
        ) : filteredQuestions.length ? (
          filteredQuestions.map((question) => (
            <Card
              key={question.id}
              className="p-5"
              draggable
              onDragStart={() => setDraggedQuestionId(question.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => onDropQuestion(question.id)}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex gap-4">
                  <button
                    type="button"
                    aria-label={`Drag question ${question.displayOrder}`}
                    className="mt-1 rounded-2xl bg-slate-100 p-2 text-slate-500"
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{question.displayOrder}</Badge>
                      <Badge tone={question.isActive ? 'success' : 'muted'}>
                        {question.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      <Badge tone="muted">{question.questionType}</Badge>
                      <Badge tone="muted">{question.difficulty}</Badge>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-slate-900">{question.questionText}</h3>
                    {question.explanation ? (
                      <p className="mt-2 text-sm leading-6 text-slate-500">{question.explanation}</p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {question.options.map((option) => (
                        <Badge key={option.id} tone={option.isCorrect ? 'success' : 'muted'}>
                          {option.displayOrder}. {option.optionText}
                        </Badge>
                      ))}
                    </div>
                    <p className="mt-4 text-xs text-slate-500">
                      Updated {formatDateTime(question.updatedAt)} · {question.pointsReward} reward / {question.negativePoints} negative
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => openEditSheet(question)}>
                    Edit
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleDeactivate(question)}>
                    Deactivate
                  </Button>
                </div>
              </div>
            </Card>
          ))
        ) : (
          <EmptyState
            title={quizId ? (search ? 'No questions match your search' : 'No questions available') : 'No quiz selected'}
            description={
              quizId
                ? search
                  ? 'Try a different search term or clear the filters to load more results.'
                  : 'Create the first question for this quiz or use the bulk import wizard.'
                : 'Choose a category and quiz to start working on question content.'
            }
          />
        )}
      </div>

      <Sheet
        open={sheetOpen}
        title={editingQuestion ? 'Edit question' : 'Create question'}
        description="Questions are saved with their answer options in the same workflow, so editors can manage correctness and order together."
        onClose={() => {
          setSheetOpen(false);
          setEditingQuestion(null);
        }}
      >
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-2">
            <Field label="Question text" error={form.formState.errors.questionText?.message}>
              <Textarea rows={4} {...form.register('questionText')} placeholder="Write the question shown to the learner." />
            </Field>

            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              <Field label="Question type" error={form.formState.errors.questionType?.message}>
                <Select {...form.register('questionType')}>
                  {QUESTION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Difficulty" error={form.formState.errors.difficulty?.message}>
                <Select {...form.register('difficulty')}>
                  {QUIZ_DIFFICULTIES.map((difficulty) => (
                    <option key={difficulty} value={difficulty}>
                      {difficulty}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Points reward" error={form.formState.errors.pointsReward?.message}>
                <Input type="number" min={0} {...form.register('pointsReward')} />
              </Field>
              <Field label="Negative points" error={form.formState.errors.negativePoints?.message}>
                <Input type="number" min={0} {...form.register('negativePoints')} />
              </Field>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Display order" error={form.formState.errors.displayOrder?.message}>
                <Input type="number" min={1} {...form.register('displayOrder')} />
              </Field>
              <label className="mt-7 flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                <Checkbox checked={form.watch('isActive')} onChange={(event) => form.setValue('isActive', event.target.checked)} />
                Keep this question active
              </label>
            </div>

            <Field label="Explanation" error={form.formState.errors.explanation?.message}>
              <Textarea rows={4} {...form.register('explanation')} placeholder="Optional explanation shown after answering." />
            </Field>

            <div className="rounded-3xl border border-slate-200 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Answer options</p>
                  <p className="mt-1 text-sm text-slate-500">At least one correct option is required.</p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() =>
                    optionFields.append({
                      optionText: '',
                      isCorrect: false,
                      displayOrder: optionFields.fields.length + 1,
                    })
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add option
                </Button>
              </div>

              <div className="mt-5 space-y-4">
                {optionFields.fields.map((field, index) => (
                  <div key={field.id} className="grid gap-4 rounded-2xl border border-slate-200 p-4 lg:grid-cols-[minmax(0,1fr)_140px_140px_60px]">
                    <Field
                      label={`Option ${index + 1}`}
                      error={form.formState.errors.options?.[index]?.optionText?.message}
                    >
                      <Input {...form.register(`options.${index}.optionText`)} placeholder="Option text" />
                    </Field>
                    <Field label="Display order" error={form.formState.errors.options?.[index]?.displayOrder?.message}>
                      <Input type="number" min={1} {...form.register(`options.${index}.displayOrder`)} />
                    </Field>
                    <label className="mt-7 flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                      <Checkbox
                        checked={form.watch(`options.${index}.isCorrect`)}
                        onChange={(event) => form.setValue(`options.${index}.isCorrect`, event.target.checked)}
                      />
                      Correct
                    </label>
                    <div className="mt-7 flex justify-end">
                      <Button
                        variant="ghost"
                        aria-label={`Remove option ${index + 1}`}
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => optionFields.remove(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                {typeof form.formState.errors.options?.message === 'string' ? (
                  <p className="text-sm font-medium text-red-600">{form.formState.errors.options.message}</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-3 border-t border-slate-200 bg-white pt-4">
            <Button variant="secondary" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending || !form.formState.isValid}>
              {saveMutation.isPending ? 'Saving...' : editingQuestion ? 'Update question' : 'Create question'}
            </Button>
          </div>
        </form>
      </Sheet>

      <BulkImportWizard
        open={bulkOpen}
        quizId={Number(quizId)}
        onClose={() => setBulkOpen(false)}
        onComplete={async () => {
          await queryClient.invalidateQueries({ queryKey: ['questions'] });
          await queryClient.invalidateQueries({ queryKey: ['quizzes'] });
          await queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
        }}
      />
    </div>
  );
}
