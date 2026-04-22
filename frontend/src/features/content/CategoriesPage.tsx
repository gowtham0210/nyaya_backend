import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  bulkDeleteCategories,
  bulkUpdateCategoryStatus,
  deactivateCategory,
  getCategories,
  saveCategory,
} from '@/features/content/api';
import { categoryDefaults, categorySchema } from '@/features/content/schemas';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { Field } from '@/components/shared/Field';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Textarea } from '@/components/ui/Textarea';
import { Category } from '@/lib/types';
import { formatDateTime, getErrorMessage, slugify } from '@/lib/utils';

type CategoryFormValues = z.infer<typeof categorySchema>;
type BulkCategoryAction = 'activate' | 'deactivate' | 'delete';

function formatCategoryCount(count: number) {
  return `${count} ${count === 1 ? 'category' : 'categories'}`;
}

function getBulkActionSuccessMessage(action: BulkCategoryAction, count: number) {
  if (action === 'delete') {
    return `Deleted ${formatCategoryCount(count)}.`;
  }

  if (action === 'activate') {
    return `Marked ${formatCategoryCount(count)} active.`;
  }

  return `Marked ${formatCategoryCount(count)} inactive.`;
}

function getBulkActionFailureMessage(action: BulkCategoryAction, count: number, error: unknown) {
  if (action === 'delete') {
    return `Failed to delete ${formatCategoryCount(count)}. ${getErrorMessage(error)}`;
  }

  if (action === 'activate') {
    return `Failed to mark ${formatCategoryCount(count)} active. ${getErrorMessage(error)}`;
  }

  return `Failed to mark ${formatCategoryCount(count)} inactive. ${getErrorMessage(error)}`;
}

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: ['categories', { showInactive }],
    queryFn: () => getCategories(showInactive),
  });
  const isInitialLoading = categoriesQuery.isPending && !categoriesQuery.data;

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: categoryDefaults,
    mode: 'onChange',
  });

  const saveMutation = useMutation({
    mutationFn: (values: CategoryFormValues) =>
      saveCategory(editingCategory?.id || null, {
        name: values.name,
        slug: values.slug,
        description: values.description || null,
        isActive: values.isActive,
      }),
    onSuccess: () => {
      toast.success(editingCategory ? 'Category updated.' : 'Category created.');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      setSheetOpen(false);
      setEditingCategory(null);
      form.reset(categoryDefaults);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: deactivateCategory,
    onSuccess: () => {
      toast.success('Category deactivated.');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['quizzes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const bulkMutation = useMutation({
    mutationFn: async ({ action, categoryIds }: { action: BulkCategoryAction; categoryIds: number[] }) => {
      const result =
        action === 'delete'
          ? await bulkDeleteCategories(categoryIds)
          : await bulkUpdateCategoryStatus(categoryIds, action === 'activate');

      return {
        action,
        ...result,
      };
    },
    onSuccess: (result) => {
      if (result.successIds.length) {
        queryClient.invalidateQueries({ queryKey: ['categories'] });
        queryClient.invalidateQueries({ queryKey: ['quizzes'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      }

      setSelectedCategoryIds((currentIds) => currentIds.filter((id) => !result.successIds.includes(id)));

      if (!result.failures.length) {
        toast.success(getBulkActionSuccessMessage(result.action, result.successIds.length));
        return;
      }

      if (!result.successIds.length) {
        toast.error(getBulkActionFailureMessage(result.action, result.failures.length, result.failures[0]?.error));
        return;
      }

      toast.error(`${getBulkActionSuccessMessage(result.action, result.successIds.length)} ${formatCategoryCount(result.failures.length)} failed.`);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const filteredCategories = useMemo(() => {
    return (categoriesQuery.data || []).filter((category) => {
      const haystack = `${category.name} ${category.slug} ${category.description || ''}`.toLowerCase();
      return haystack.includes(search.toLowerCase());
    });
  }, [categoriesQuery.data, search]);
  const selectedIdSet = useMemo(() => new Set(selectedCategoryIds), [selectedCategoryIds]);
  const selectedCategories = useMemo(
    () => filteredCategories.filter((category) => selectedIdSet.has(category.id)),
    [filteredCategories, selectedIdSet]
  );
  const hasStoredCategories = Boolean(categoriesQuery.data?.length);
  const isFilterEmpty = hasStoredCategories && !filteredCategories.length;
  const selectedCount = selectedCategories.length;
  const allVisibleSelected = Boolean(filteredCategories.length) && selectedCount === filteredCategories.length;
  const isMutating = deleteMutation.isPending || bulkMutation.isPending;

  useEffect(() => {
    const visibleIds = new Set(filteredCategories.map((category) => category.id));

    setSelectedCategoryIds((currentIds) => {
      const nextIds = currentIds.filter((id) => visibleIds.has(id));
      return nextIds.length === currentIds.length ? currentIds : nextIds;
    });
  }, [filteredCategories]);

  function openCreateSheet() {
    setEditingCategory(null);
    form.reset(categoryDefaults);
    setSheetOpen(true);
  }

  function openEditSheet(category: Category) {
    setEditingCategory(category);
    form.reset({
      name: category.name,
      slug: category.slug,
      description: category.description || '',
      isActive: category.isActive,
    });
    setSheetOpen(true);
  }

  function toggleVisibleSelection(checked: boolean) {
    setSelectedCategoryIds(checked ? filteredCategories.map((category) => category.id) : []);
  }

  function toggleCategorySelection(categoryId: number, checked: boolean) {
    setSelectedCategoryIds((currentIds) => {
      if (checked) {
        return currentIds.includes(categoryId) ? currentIds : [...currentIds, categoryId];
      }

      return currentIds.filter((id) => id !== categoryId);
    });
  }

  async function handleDeactivate(category: Category) {
    const approved = await confirm({
      title: `Deactivate "${category.name}"?`,
      description: 'The category will remain in the database but become inactive for the admin content workflow.',
      confirmText: 'Deactivate category',
      tone: 'danger',
    });

    if (approved) {
      deleteMutation.mutate(category.id);
    }
  }

  async function handleBulkDelete() {
    if (!selectedCount) {
      return;
    }

    const approved = await confirm({
      title: `Delete ${formatCategoryCount(selectedCount)}?`,
      description: 'Selected categories will be removed from the current admin workflow.',
      confirmText: selectedCount === 1 ? 'Delete category' : 'Delete categories',
      tone: 'danger',
    });

    if (approved) {
      bulkMutation.mutate({
        action: 'delete',
        categoryIds: selectedCategories.map((category) => category.id),
      });
    }
  }

  function handleBulkStatusChange(isActive: boolean) {
    if (!selectedCount) {
      return;
    }

    bulkMutation.mutate({
      action: isActive ? 'activate' : 'deactivate',
      categoryIds: selectedCategories.map((category) => category.id),
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Content"
        title="Categories"
        description="Manage top-level content groups, keep slugs tidy, and handle row-level or bulk status changes for editors."
      >
        <div className="flex w-full flex-col gap-3 lg:w-[30rem] lg:items-end">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 sm:shrink-0">
              <Checkbox checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
              Show inactive
            </label>
            <Input
              className="w-full sm:flex-1"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search categories"
            />
          </div>
          <Button className="w-full sm:w-auto lg:self-end" onClick={openCreateSheet}>
            Create category
          </Button>
        </div>
      </PageHeader>

      <Card className="overflow-hidden">
        {selectedCount ? (
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Badge>{formatCategoryCount(selectedCount)} selected</Badge>
              <p className="text-sm text-slate-600">Apply one action to the currently visible selection.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => handleBulkStatusChange(true)} disabled={isMutating}>
                Mark active
              </Button>
              <Button variant="secondary" size="sm" onClick={() => handleBulkStatusChange(false)} disabled={isMutating}>
                Mark inactive
              </Button>
              <Button variant="danger" size="sm" onClick={handleBulkDelete} disabled={isMutating}>
                Delete selected
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedCategoryIds([])} disabled={isMutating}>
                Clear selection
              </Button>
            </div>
          </div>
        ) : null}

        {isInitialLoading ? (
          <div className="p-6">
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              Loading categories...
            </div>
          </div>
        ) : filteredCategories.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-medium">
                    <Checkbox
                      aria-label="Select all visible categories"
                      checked={allVisibleSelected}
                      disabled={isMutating}
                      onChange={(event) => toggleVisibleSelection(event.target.checked)}
                    />
                  </th>
                  <th className="px-5 py-4 font-medium">Name</th>
                  <th className="px-5 py-4 font-medium">Slug</th>
                  <th className="px-5 py-4 font-medium">Status</th>
                  <th className="px-5 py-4 font-medium">Updated</th>
                  <th className="px-5 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCategories.map((category) => (
                  <tr key={category.id}>
                    <td className="px-5 py-4">
                      <Checkbox
                        aria-label={`Select ${category.name}`}
                        checked={selectedIdSet.has(category.id)}
                        disabled={isMutating}
                        onChange={(event) => toggleCategorySelection(category.id, event.target.checked)}
                      />
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-900">{category.name}</p>
                      {category.description ? (
                        <p className="mt-1 text-xs text-slate-500">{category.description}</p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 text-slate-600">{category.slug}</td>
                    <td className="px-5 py-4">
                      <Badge tone={category.isActive ? 'success' : 'muted'}>
                        {category.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{formatDateTime(category.updatedAt)}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => openEditSheet(category)} disabled={isMutating}>
                          Edit
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => handleDeactivate(category)} disabled={isMutating}>
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
              title={isFilterEmpty ? 'No categories match your filters' : 'No categories yet'}
              description={
                isFilterEmpty
                  ? 'Try another search term or adjust inactive visibility to load more category records.'
                  : 'Create the first category to start structuring the Nyaya question bank.'
              }
            />
          </div>
        )}
      </Card>

      <Sheet
        open={sheetOpen}
        title={editingCategory ? 'Edit category' : 'Create category'}
        description="Categories organize quizzes and make content easier for editors to find."
        onClose={() => {
          setSheetOpen(false);
          setEditingCategory(null);
        }}
      >
        <form className="grid gap-5" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Category name" error={form.formState.errors.name?.message}>
              <Input {...form.register('name')} placeholder="Constitutional Law" />
            </Field>
            <Field label="Slug" error={form.formState.errors.slug?.message} hint="Auto-generated if blank">
              <div className="flex gap-3">
                <Input {...form.register('slug')} placeholder="constitutional-law" />
                <Button
                  variant="secondary"
                  onClick={() => form.setValue('slug', slugify(form.getValues('name')), { shouldValidate: true })}
                >
                  Generate
                </Button>
              </div>
            </Field>
          </div>

          <Field label="Description" error={form.formState.errors.description?.message}>
            <Textarea rows={5} {...form.register('description')} placeholder="Describe this content area." />
          </Field>

          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
            <Checkbox checked={form.watch('isActive')} onChange={(event) => form.setValue('isActive', event.target.checked)} />
            Keep this category active
          </label>

          {form.formState.errors.root?.message ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {form.formState.errors.root.message}
            </div>
          ) : null}

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending || !form.formState.isValid}>
              {saveMutation.isPending ? 'Saving...' : editingCategory ? 'Update category' : 'Create category'}
            </Button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}
