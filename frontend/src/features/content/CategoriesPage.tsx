import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { getCategories, saveCategory, deactivateCategory } from '@/features/content/api';
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

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: ['categories', { showInactive }],
    queryFn: () => getCategories(showInactive),
  });

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
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const filteredCategories = useMemo(() => {
    return (categoriesQuery.data || []).filter((category) => {
      const haystack = `${category.name} ${category.slug} ${category.description || ''}`.toLowerCase();
      return haystack.includes(search.toLowerCase());
    });
  }, [categoriesQuery.data, search]);

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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Content"
        title="Categories"
        description="Manage top-level content groups, keep slugs tidy, and control which categories remain active for editors."
        actionLabel="Create category"
        onAction={openCreateSheet}
      >
        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">
          <Checkbox checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
          Show inactive
        </label>
        <Input
          className="w-full sm:w-80"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search categories"
        />
      </PageHeader>

      <Card className="overflow-hidden">
        {filteredCategories.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
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
                        <Button variant="secondary" size="sm" onClick={() => openEditSheet(category)}>
                          Edit
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => handleDeactivate(category)}>
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
              title="No categories yet"
              description="Create the first category to start structuring the Nyaya question bank."
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
