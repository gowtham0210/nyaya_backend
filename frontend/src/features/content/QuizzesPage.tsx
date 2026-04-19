import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { getCategories, getQuizzes, saveQuiz, deactivateQuiz } from '@/features/content/api';
import { QUIZ_DIFFICULTIES, quizDefaults, quizSchema } from '@/features/content/schemas';
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
import { Quiz } from '@/lib/types';
import { formatDateTime, getErrorMessage, slugify } from '@/lib/utils';

type QuizFormValues = z.infer<typeof quizSchema>;

export function QuizzesPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: ['categories', { showInactive: true }],
    queryFn: () => getCategories(true),
  });

  const quizzesQuery = useQuery({
    queryKey: ['quizzes', { categoryId, showInactive }],
    queryFn: () => getQuizzes({ categoryId, showInactive }),
  });

  const form = useForm<QuizFormValues>({
    resolver: zodResolver(quizSchema),
    defaultValues: quizDefaults as QuizFormValues,
    mode: 'onChange',
  });

  const saveMutation = useMutation({
    mutationFn: (values: QuizFormValues) =>
      saveQuiz(editingQuiz?.id || null, {
        categoryId: Number(values.categoryId),
        title: values.title,
        slug: values.slug,
        description: values.description || null,
        difficulty: values.difficulty,
        totalQuestions: editingQuiz?.totalQuestions || 0,
        timeLimitSeconds: values.timeLimitSeconds ?? null,
        passingScore: values.passingScore,
        isActive: values.isActive,
      }),
    onSuccess: () => {
      toast.success(editingQuiz ? 'Quiz updated.' : 'Quiz created.');
      queryClient.invalidateQueries({ queryKey: ['quizzes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      setSheetOpen(false);
      setEditingQuiz(null);
      form.reset({
        ...quizDefaults,
        categoryId: categoryId || 0,
      } as QuizFormValues);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: deactivateQuiz,
    onSuccess: () => {
      toast.success('Quiz deactivated.');
      queryClient.invalidateQueries({ queryKey: ['quizzes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const filteredQuizzes = useMemo(() => {
    return (quizzesQuery.data || []).filter((quiz) => {
      const categoryName =
        categoriesQuery.data?.find((category) => category.id === quiz.categoryId)?.name || '';
      const haystack = `${quiz.title} ${quiz.slug} ${quiz.description || ''} ${categoryName}`.toLowerCase();
      return haystack.includes(search.toLowerCase());
    });
  }, [categoriesQuery.data, quizzesQuery.data, search]);

  function openCreateSheet() {
    setEditingQuiz(null);
    form.reset({
      ...quizDefaults,
      categoryId: categoryId || 0,
    });
    setSheetOpen(true);
  }

  function openEditSheet(quiz: Quiz) {
    setEditingQuiz(quiz);
    form.reset({
      categoryId: quiz.categoryId,
      title: quiz.title,
      slug: quiz.slug,
      description: quiz.description || '',
      difficulty: quiz.difficulty as any,
      timeLimitSeconds: quiz.timeLimitSeconds,
      passingScore: quiz.passingScore || 0,
      isActive: quiz.isActive,
    } as QuizFormValues);
    setSheetOpen(true);
  }

  async function handleDeactivate(quiz: Quiz) {
    const approved = await confirm({
      title: `Deactivate "${quiz.title}"?`,
      description: 'The quiz will remain in the database but become inactive for future operations.',
      confirmText: 'Deactivate quiz',
      tone: 'danger',
    });

    if (approved) {
      deleteMutation.mutate(quiz.id);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Content"
        title="Quizzes"
        description="Manage quiz metadata, category placement, difficulty, timing, and activation state."
        actionLabel="Create quiz"
        onAction={openCreateSheet}
      >
        <Select
          className="sm:w-56"
          value={categoryId || ''}
          onChange={(event) => setCategoryId(event.target.value ? Number(event.target.value) : null)}
        >
          <option value="">All categories</option>
          {(categoriesQuery.data || []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
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
          placeholder="Search quizzes"
        />
      </PageHeader>

      <Card className="overflow-hidden">
        {filteredQuizzes.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-medium">Quiz</th>
                  <th className="px-5 py-4 font-medium">Category</th>
                  <th className="px-5 py-4 font-medium">Difficulty</th>
                  <th className="px-5 py-4 font-medium">Questions</th>
                  <th className="px-5 py-4 font-medium">Status</th>
                  <th className="px-5 py-4 font-medium">Updated</th>
                  <th className="px-5 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredQuizzes.map((quiz) => (
                  <tr key={quiz.id}>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-900">{quiz.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{quiz.slug}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {categoriesQuery.data?.find((category) => category.id === quiz.categoryId)?.name || '—'}
                    </td>
                    <td className="px-5 py-4">
                      <Badge>{quiz.difficulty}</Badge>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{quiz.totalQuestions}</td>
                    <td className="px-5 py-4">
                      <Badge tone={quiz.isActive ? 'success' : 'muted'}>
                        {quiz.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{formatDateTime(quiz.updatedAt)}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => openEditSheet(quiz)}>
                          Edit
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => handleDeactivate(quiz)}>
                          Deactivate
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6">
            <EmptyState
              title="No quizzes found"
              description="Create the first quiz or adjust your filters to load more results."
            />
          </div>
        )}
      </Card>

      <Sheet
        open={sheetOpen}
        title={editingQuiz ? 'Edit quiz' : 'Create quiz'}
        description="Quizzes carry category assignment, difficulty, time limit, and scoring configuration."
        onClose={() => {
          setSheetOpen(false);
          setEditingQuiz(null);
        }}
      >
        <form className="grid gap-5" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Quiz title" error={form.formState.errors.title?.message}>
              <Input {...form.register('title')} placeholder="Fundamental Rights Basics" />
            </Field>

            <Field label="Slug" error={form.formState.errors.slug?.message}>
              <div className="flex gap-3">
                <Input {...form.register('slug')} placeholder="fundamental-rights-basics" />
                <Button
                  variant="secondary"
                  onClick={() => form.setValue('slug', slugify(form.getValues('title')), { shouldValidate: true })}
                >
                  Generate
                </Button>
              </div>
            </Field>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Category" error={form.formState.errors.categoryId?.message}>
              <Select {...form.register('categoryId')}>
                <option value="">Select category</option>
                {(categoriesQuery.data || []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
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
          </div>

          <Field label="Description" error={form.formState.errors.description?.message}>
            <Textarea rows={5} {...form.register('description')} placeholder="Describe the quiz purpose." />
          </Field>

          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Passing score" error={form.formState.errors.passingScore?.message}>
              <Input type="number" min={0} step="0.01" {...form.register('passingScore')} />
            </Field>

            <Field label="Time limit in seconds" error={form.formState.errors.timeLimitSeconds?.message}>
              <Input type="number" min={0} {...form.register('timeLimitSeconds')} />
            </Field>
          </div>

          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
            <Checkbox checked={form.watch('isActive')} onChange={(event) => form.setValue('isActive', event.target.checked)} />
            Keep this quiz active
          </label>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending || !form.formState.isValid}>
              {saveMutation.isPending ? 'Saving...' : editingQuiz ? 'Update quiz' : 'Create quiz'}
            </Button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}
