import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { getLevels, saveLevel } from '@/features/gamification/api';
import { levelDefaults, levelSchema } from '@/features/content/schemas';
import { Field } from '@/components/shared/Field';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Textarea } from '@/components/ui/Textarea';
import { Level } from '@/lib/types';
import { formatDateTime, getErrorMessage } from '@/lib/utils';

type LevelFormValues = z.infer<typeof levelSchema>;

export function LevelsPage() {
  const queryClient = useQueryClient();
  const [editingLevel, setEditingLevel] = useState<Level | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const levelsQuery = useQuery({
    queryKey: ['levels'],
    queryFn: getLevels,
  });
  const isInitialLoading = levelsQuery.isPending && !levelsQuery.data;

  const form = useForm<LevelFormValues>({
    resolver: zodResolver(levelSchema),
    defaultValues: levelDefaults,
    mode: 'onChange',
  });

  const saveMutation = useMutation({
    mutationFn: (values: LevelFormValues) =>
      saveLevel(editingLevel?.id || null, {
        code: values.code,
        name: values.name,
        minPoints: values.minPoints,
        maxPoints: values.maxPoints,
        badgeIcon: values.badgeIcon || null,
        rewardDescription: values.rewardDescription || null,
      }),
    onSuccess: () => {
      toast.success(editingLevel ? 'Level updated.' : 'Level created.');
      queryClient.invalidateQueries({ queryKey: ['levels'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      setSheetOpen(false);
      setEditingLevel(null);
      form.reset(levelDefaults);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const ladderSegments = useMemo(() => {
    const levels = levelsQuery.data || [];
    const maxPoints = Math.max(...levels.map((level) => level.maxPoints), 1);

    return levels.map((level) => ({
      ...level,
      widthPercentage: ((level.maxPoints - level.minPoints + 1) / maxPoints) * 100,
    }));
  }, [levelsQuery.data]);

  function openCreateSheet() {
    setEditingLevel(null);
    form.reset(levelDefaults);
    setSheetOpen(true);
  }

  function openEditSheet(level: Level) {
    setEditingLevel(level);
    form.reset({
      code: level.code,
      name: level.name,
      minPoints: level.minPoints,
      maxPoints: level.maxPoints,
      badgeIcon: level.badgeIcon || '',
      rewardDescription: level.rewardDescription || '',
    });
    setSheetOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gamification"
        title="Levels"
        description="Configure the point thresholds that define player progression and verify there are no gaps or overlaps."
        actionLabel="Create level"
        onAction={openCreateSheet}
      />

      <Card className="p-6">
        <p className="text-sm font-semibold text-slate-900">Level ladder preview</p>
        <p className="mt-1 text-sm text-slate-500">
          This visual timeline helps editors spot threshold jumps before saving new ranges.
        </p>

        {isInitialLoading ? (
          <div className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
            Loading levels...
          </div>
        ) : ladderSegments.length ? (
          <div className="mt-5 space-y-4">
            <div className="flex overflow-hidden rounded-full bg-slate-100">
              {ladderSegments.map((level) => (
                <div
                  key={level.id}
                  className="flex min-h-16 items-center justify-center border-r border-white bg-gradient-to-r from-teal-600 to-cyan-500 px-3 text-center text-xs font-semibold text-white"
                  style={{ width: `${Math.max(level.widthPercentage, 10)}%` }}
                >
                  {level.name}
                </div>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {ladderSegments.map((level) => (
                <div key={level.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="font-medium text-slate-900">{level.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {level.minPoints} to {level.maxPoints} points
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-5">
            <EmptyState
              title="No levels configured yet"
              description="Create your first level to unlock progression and leaderboard context."
            />
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        {isInitialLoading ? (
          <div className="p-6">
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              Loading levels...
            </div>
          </div>
        ) : levelsQuery.data?.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-medium">Level</th>
                  <th className="px-5 py-4 font-medium">Range</th>
                  <th className="px-5 py-4 font-medium">Badge</th>
                  <th className="px-5 py-4 font-medium">Reward</th>
                  <th className="px-5 py-4 font-medium">Updated</th>
                  <th className="px-5 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {levelsQuery.data.map((level) => (
                  <tr key={level.id}>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-900">{level.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{level.code}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {level.minPoints} - {level.maxPoints}
                    </td>
                    <td className="px-5 py-4">
                      {level.badgeIcon ? <Badge>{level.badgeIcon}</Badge> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-5 py-4 text-slate-600">{level.rewardDescription || '—'}</td>
                    <td className="px-5 py-4 text-slate-600">{formatDateTime(level.updatedAt)}</td>
                    <td className="px-5 py-4 text-right">
                      <Button variant="secondary" size="sm" onClick={() => openEditSheet(level)}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6">
            <EmptyState
              title="No levels found"
              description="Create the first level to define progress milestones."
            />
          </div>
        )}
      </Card>

      <Sheet
        open={sheetOpen}
        title={editingLevel ? 'Edit level' : 'Create level'}
        description="Levels are stored through the admin API and displayed to learners as they progress."
        onClose={() => {
          setSheetOpen(false);
          setEditingLevel(null);
        }}
      >
        <form className="grid gap-5" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Code" error={form.formState.errors.code?.message}>
              <Input {...form.register('code')} placeholder="bronze" />
            </Field>
            <Field label="Name" error={form.formState.errors.name?.message}>
              <Input {...form.register('name')} placeholder="Bronze" />
            </Field>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Minimum points" error={form.formState.errors.minPoints?.message}>
              <Input type="number" min={0} {...form.register('minPoints')} />
            </Field>
            <Field label="Maximum points" error={form.formState.errors.maxPoints?.message}>
              <Input type="number" min={0} {...form.register('maxPoints')} />
            </Field>
          </div>

          <Field label="Badge icon label" error={form.formState.errors.badgeIcon?.message}>
            <Input {...form.register('badgeIcon')} placeholder="shield" />
          </Field>

          <Field label="Reward description" error={form.formState.errors.rewardDescription?.message}>
            <Textarea rows={4} {...form.register('rewardDescription')} placeholder="Describe the perk or recognition for this level." />
          </Field>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending || !form.formState.isValid}>
              {saveMutation.isPending ? 'Saving...' : editingLevel ? 'Update level' : 'Create level'}
            </Button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}
