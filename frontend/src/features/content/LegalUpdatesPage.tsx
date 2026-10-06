import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { deleteLegalUpdate, getLegalUpdates, saveLegalUpdate, uploadLegalUpdateImage } from '@/features/content/api';
import { legalUpdateDefaults, legalUpdateSchema } from '@/features/content/schemas';
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
import { resolveAssetUrl } from '@/lib/config';
import { LEGAL_UPDATE_CATEGORIES, LegalUpdate } from '@/lib/types';
import { getErrorMessage } from '@/lib/utils';

type LegalUpdateFormValues = z.infer<typeof legalUpdateSchema>;

const CATEGORY_TONES: Record<LegalUpdate['category'], 'default' | 'success' | 'warning' | 'muted'> = {
  Judgements: 'default',
  Legislation: 'success',
  Reforms: 'warning',
  Notices: 'muted',
};

function formatUpdateDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`));
}

export function LegalUpdatesPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [editingUpdate, setEditingUpdate] = useState<LegalUpdate | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);

  const legalUpdatesQuery = useQuery({
    queryKey: ['legal-updates'],
    queryFn: getLegalUpdates,
  });
  const isInitialLoading = legalUpdatesQuery.isPending && !legalUpdatesQuery.data;

  const form = useForm<LegalUpdateFormValues>({
    resolver: zodResolver(legalUpdateSchema),
    defaultValues: legalUpdateDefaults(),
    mode: 'onChange',
  });

  // Preview of a newly picked file; revoked when it changes or the sheet closes.
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null);
      return undefined;
    }

    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const currentImageUrl = imagePreview || (removeImage ? null : resolveAssetUrl(editingUpdate?.imageUrl));

  const saveMutation = useMutation({
    // Save the text first: a new update needs its id before an image can be attached.
    mutationFn: async (values: LegalUpdateFormValues) => {
      const saved = await saveLegalUpdate(editingUpdate?.id || null, {
        category: values.category,
        title: values.title,
        summary: values.summary || null,
        updateDate: values.updateDate,
        source: values.source || null,
        ...(removeImage && !imageFile ? { imageUrl: null } : {}),
      });

      if (!imageFile) {
        return { saved, imageError: null };
      }

      try {
        return { saved: await uploadLegalUpdateImage(saved.id, imageFile), imageError: null };
      } catch (error) {
        return { saved, imageError: error };
      }
    },
    onSuccess: ({ imageError }) => {
      if (imageError) {
        toast.error(`Update saved, but the image failed to upload. ${getErrorMessage(imageError)}`);
      } else {
        toast.success(editingUpdate ? 'Legal update saved.' : 'Legal update published.');
      }

      queryClient.invalidateQueries({ queryKey: ['legal-updates'] });
      closeSheet();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteLegalUpdate,
    onSuccess: () => {
      toast.success('Legal update deleted.');
      queryClient.invalidateQueries({ queryKey: ['legal-updates'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const filteredUpdates = useMemo(() => {
    const term = search.toLowerCase();

    return (legalUpdatesQuery.data || []).filter((item) => {
      if (categoryFilter && item.category !== categoryFilter) {
        return false;
      }

      return `${item.title} ${item.summary || ''} ${item.source || ''}`.toLowerCase().includes(term);
    });
  }, [legalUpdatesQuery.data, search, categoryFilter]);
  const isFilterEmpty = Boolean(legalUpdatesQuery.data?.length) && !filteredUpdates.length;

  function resetImageState() {
    setImageFile(null);
    setRemoveImage(false);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditingUpdate(null);
    resetImageState();
  }

  function openCreateSheet() {
    setEditingUpdate(null);
    resetImageState();
    form.reset({
      ...legalUpdateDefaults(),
      ...(categoryFilter ? { category: categoryFilter as LegalUpdate['category'] } : {}),
    });
    setSheetOpen(true);
  }

  function openEditSheet(item: LegalUpdate) {
    setEditingUpdate(item);
    resetImageState();
    form.reset({
      category: item.category,
      title: item.title,
      summary: item.summary || '',
      updateDate: item.updateDate,
      source: item.source || '',
    });
    setSheetOpen(true);
  }

  async function handleDelete(item: LegalUpdate) {
    const approved = await confirm({
      title: `Delete "${item.title}"?`,
      description: 'It will disappear from the app straight away and cannot be restored.',
      confirmText: 'Delete update',
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
        title="Legal Updates"
        description="News items shown in the app's Legal Updates section: judgements, new legislation, reforms and official notices. Newest date first."
      >
        <div className="flex w-full flex-col gap-3 lg:w-[30rem] lg:items-end">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
            <Select
              className="w-full sm:w-44"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              aria-label="Filter by category"
            >
              <option value="">All categories</option>
              {LEGAL_UPDATE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
            <Input
              className="w-full sm:flex-1"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search legal updates"
            />
          </div>
          <Button className="w-full sm:w-auto lg:self-end" onClick={openCreateSheet}>
            Add legal update
          </Button>
        </div>
      </PageHeader>

      <Card className="overflow-hidden">
        {isInitialLoading ? (
          <div className="p-6">
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              Loading legal updates...
            </div>
          </div>
        ) : filteredUpdates.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-medium">Update</th>
                  <th className="px-5 py-4 font-medium">Category</th>
                  <th className="px-5 py-4 font-medium">Date</th>
                  <th className="px-5 py-4 font-medium">Source</th>
                  <th className="px-5 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUpdates.map((item) => {
                  const imageUrl = resolveAssetUrl(item.imageUrl);

                  return (
                    <tr key={item.id} className="align-top">
                      <td className="px-5 py-4">
                        <div className="flex max-w-xl gap-4">
                          {imageUrl ? (
                            <img src={imageUrl} alt="" className="h-14 w-20 shrink-0 rounded-xl object-cover" />
                          ) : (
                            <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                              <ImageIcon className="h-5 w-5" />
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-slate-900">{item.title}</p>
                            {item.summary ? (
                              <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.summary}</p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <Badge tone={CATEGORY_TONES[item.category]}>{item.category}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-600">{formatUpdateDate(item.updateDate)}</td>
                      <td className="max-w-[14rem] px-5 py-4 text-slate-600">{item.source || '—'}</td>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6">
            <EmptyState
              title={isFilterEmpty ? 'No legal updates match your filters' : 'No legal updates yet'}
              description={
                isFilterEmpty
                  ? 'Try another search term or clear the category filter.'
                  : "Add the first update; it appears in the app's Legal Updates section as soon as it's saved."
              }
            />
          </div>
        )}
      </Card>

      <Sheet
        open={sheetOpen}
        title={editingUpdate ? 'Edit legal update' : 'Add legal update'}
        description="Saved updates show in the app immediately, ordered by date."
        onClose={closeSheet}
      >
        <form className="grid gap-5" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Category" error={form.formState.errors.category?.message}>
              <Select {...form.register('category')}>
                {LEGAL_UPDATE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date" error={form.formState.errors.updateDate?.message}>
              <Input type="date" {...form.register('updateDate')} />
            </Field>
          </div>

          <Field label="Title" error={form.formState.errors.title?.message}>
            <Input {...form.register('title')} placeholder="Supreme Court upholds right to privacy in data case" />
          </Field>

          <Field label="Summary" error={form.formState.errors.summary?.message} hint="Optional">
            <Textarea rows={5} {...form.register('summary')} placeholder="Two or three plain-language sentences on what changed and who it affects." />
          </Field>

          <Field label="Source" error={form.formState.errors.source?.message} hint="Optional">
            <Input {...form.register('source')} placeholder="Supreme Court of India" />
          </Field>

          <div className="grid gap-2 text-sm">
            <span className="font-medium text-slate-700">Image</span>
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center">
              {currentImageUrl ? (
                <img src={currentImageUrl} alt="" className="h-24 w-36 shrink-0 rounded-xl object-cover" />
              ) : (
                <div className="flex h-24 w-36 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                  <ImageIcon className="h-6 w-6" />
                </div>
              )}
              <div className="grid gap-2">
                <input
                  type="file"
                  aria-label="Upload image"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
                  onChange={(event) => {
                    setImageFile(event.target.files?.[0] || null);
                    setRemoveImage(false);
                  }}
                />
                <p className="text-xs text-slate-400">JPEG, PNG, WEBP or GIF, up to 5MB.</p>
                {currentImageUrl ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-self-start text-red-600 hover:bg-red-50"
                    onClick={() => {
                      setImageFile(null);
                      setRemoveImage(true);
                    }}
                  >
                    Remove image
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={closeSheet}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending || !form.formState.isValid}>
              {saveMutation.isPending ? 'Saving...' : editingUpdate ? 'Save changes' : 'Publish update'}
            </Button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}
