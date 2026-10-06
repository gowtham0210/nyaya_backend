import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { deleteDailyQuestion, getDailyQuestions, saveDailyQuestion } from '@/features/content/api';
import { dailyQuestionDefaults, dailyQuestionSchema } from '@/features/content/schemas';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { Field } from '@/components/shared/Field';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Sheet } from '@/components/ui/Sheet';
import { Textarea } from '@/components/ui/Textarea';
import { DailyQuestion } from '@/lib/types';
import { getErrorMessage } from '@/lib/utils';

type DailyQuestionFormValues = z.infer<typeof dailyQuestionSchema>;

const CATEGORY_SUGGESTIONS_ID = 'daily-question-categories';

export function DailyQuestionsPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [editingQuestion, setEditingQuestion] = useState<DailyQuestion | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const dailyQuestionsQuery = useQuery({
    queryKey: ['daily-questions'],
    queryFn: getDailyQuestions,
  });
  const isInitialLoading = dailyQuestionsQuery.isPending && !dailyQuestionsQuery.data;

  const form = useForm<DailyQuestionFormValues>({
    resolver: zodResolver(dailyQuestionSchema),
    defaultValues: dailyQuestionDefaults,
    mode: 'onChange',
  });

  const saveMutation = useMutation({
    mutationFn: (values: DailyQuestionFormValues) =>
      saveDailyQuestion(editingQuestion?.id || null, {
        category: values.category,
        question: values.question,
        answer: values.answer,
      }),
    onSuccess: () => {
      toast.success(editingQuestion ? 'Daily question updated.' : 'Daily question created.');
      queryClient.invalidateQueries({ queryKey: ['daily-questions'] });
      setSheetOpen(false);
      setEditingQuestion(null);
      form.reset(dailyQuestionDefaults);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDailyQuestion,
    onSuccess: () => {
      toast.success('Daily question deleted.');
      queryClient.invalidateQueries({ queryKey: ['daily-questions'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  // Category is free text on the backend; reuse what's already there so
  // editors pick an existing spelling instead of creating near-duplicates.
  const categories = useMemo(
    () => Array.from(new Set((dailyQuestionsQuery.data || []).map((item) => item.category))).sort(),
    [dailyQuestionsQuery.data]
  );

  const filteredQuestions = useMemo(() => {
    const term = search.toLowerCase();

    return (dailyQuestionsQuery.data || []).filter((item) => {
      if (categoryFilter && item.category !== categoryFilter) {
        return false;
      }

      return `${item.category} ${item.question} ${item.answer}`.toLowerCase().includes(term);
    });
  }, [dailyQuestionsQuery.data, search, categoryFilter]);
  const isFilterEmpty = Boolean(dailyQuestionsQuery.data?.length) && !filteredQuestions.length;

  function openCreateSheet() {
    setEditingQuestion(null);
    form.reset({ ...dailyQuestionDefaults, category: categoryFilter });
    setSheetOpen(true);
  }

  function openEditSheet(item: DailyQuestion) {
    setEditingQuestion(item);
    form.reset({
      category: item.category,
      question: item.question,
      answer: item.answer,
    });
    setSheetOpen(true);
  }

  async function handleDelete(item: DailyQuestion) {
    const approved = await confirm({
      title: 'Delete this daily question?',
      description: 'It will be permanently removed, along with any translations. This cannot be undone.',
      confirmText: 'Delete question',
      tone: 'danger',
    });

    if (approved) {
      deleteMutation.mutate(item.id);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Content"
        title="Daily Questions"
        description="Short question-and-answer cards the app shows at random each day. Keep answers brief and self-contained."
      >
        <div className="flex w-full flex-col gap-3 lg:w-[30rem] lg:items-end">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
            <Select
              className="w-full sm:w-48"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              aria-label="Filter by category"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
            <Input
              className="w-full sm:flex-1"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search daily questions"
            />
          </div>
          <Button className="w-full sm:w-auto lg:self-end" onClick={openCreateSheet}>
            Add daily question
          </Button>
        </div>
      </PageHeader>

      <Card className="overflow-hidden">
        {isInitialLoading ? (
          <div className="p-6">
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              Loading daily questions...
            </div>
          </div>
        ) : filteredQuestions.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-medium">Question</th>
                  <th className="px-5 py-4 font-medium">Answer</th>
                  <th className="px-5 py-4 font-medium">Category</th>
                  <th className="px-5 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredQuestions.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td className="max-w-md px-5 py-4 font-medium text-slate-900">{item.question}</td>
                    <td className="max-w-md px-5 py-4 text-slate-600">{item.answer}</td>
                    <td className="px-5 py-4">
                      <Badge>{item.category}</Badge>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openEditSheet(item)}
                          disabled={deleteMutation.isPending}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDelete(item)}
                          disabled={deleteMutation.isPending}
                        >
                          Delete
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
              title={isFilterEmpty ? 'No daily questions match your filters' : 'No daily questions yet'}
              description={
                isFilterEmpty
                  ? 'Try another search term or clear the category filter.'
                  : 'Add the first daily question so the app has something to show users each day.'
              }
            />
          </div>
        )}
      </Card>

      <Sheet
        open={sheetOpen}
        title={editingQuestion ? 'Edit daily question' : 'Add daily question'}
        description="The app picks daily questions at random, so each one should make sense on its own."
        onClose={() => {
          setSheetOpen(false);
          setEditingQuestion(null);
        }}
      >
        <form className="grid gap-5" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
          <Field label="Category" error={form.formState.errors.category?.message} hint="Pick an existing one or type a new one">
            <Input {...form.register('category')} list={CATEGORY_SUGGESTIONS_ID} placeholder="Consumer Rights" />
            <datalist id={CATEGORY_SUGGESTIONS_ID}>
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </Field>

          <Field label="Question" error={form.formState.errors.question?.message}>
            <Textarea rows={4} {...form.register('question')} placeholder="Can a shop refuse to accept a coin that is legal tender?" />
          </Field>

          <Field label="Answer" error={form.formState.errors.answer?.message}>
            <Textarea rows={6} {...form.register('answer')} placeholder="A short, plain-language answer." />
          </Field>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending || !form.formState.isValid}>
              {saveMutation.isPending ? 'Saving...' : editingQuestion ? 'Update question' : 'Add question'}
            </Button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}
