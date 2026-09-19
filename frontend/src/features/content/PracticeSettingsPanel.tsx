import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getPracticeSettings, savePracticeSetting } from '@/features/content/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { PracticeSetting } from '@/lib/types';
import { getErrorMessage } from '@/lib/utils';

function DifficultyRow({ setting }: { setting: PracticeSetting }) {
  const queryClient = useQueryClient();
  const [questionCount, setQuestionCount] = useState(setting.questionCount);
  const [isEnabled, setIsEnabled] = useState(setting.isEnabled);

  useEffect(() => {
    setQuestionCount(setting.questionCount);
    setIsEnabled(setting.isEnabled);
  }, [setting.questionCount, setting.isEnabled]);

  const saveMutation = useMutation({
    mutationFn: () => savePracticeSetting(setting.difficulty, { questionCount, isEnabled }),
    onSuccess: () => {
      toast.success(`${setting.difficulty} practice settings updated.`);
      queryClient.invalidateQueries({ queryKey: ['practice-settings'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const isDirty = questionCount !== setting.questionCount || isEnabled !== setting.isEnabled;

  return (
    <tr>
      <td className="px-5 py-4">
        <Badge>{setting.difficulty[0].toUpperCase() + setting.difficulty.slice(1)}</Badge>
      </td>
      <td className="px-5 py-4">
        <Input
          type="number"
          min={1}
          className="w-24"
          value={questionCount}
          onChange={(event) => setQuestionCount(Number(event.target.value))}
        />
      </td>
      <td className="px-5 py-4">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <Checkbox checked={isEnabled} onChange={(event) => setIsEnabled(event.target.checked)} />
          Enabled
        </label>
      </td>
      <td className="px-5 py-4 text-right">
        <Button
          variant="secondary"
          size="sm"
          disabled={!isDirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? 'Saving...' : 'Save'}
        </Button>
      </td>
    </tr>
  );
}

export function PracticeSettingsPanel() {
  const settingsQuery = useQuery({
    queryKey: ['practice-settings'],
    queryFn: getPracticeSettings,
  });

  return (
    <Card className="overflow-hidden">
      {settingsQuery.isPending ? (
        <div className="p-6">
          <EmptyState
            title="Loading practice settings..."
            description="Fetching question count and enabled state for each difficulty."
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-5 py-4 font-medium">Difficulty</th>
                <th className="px-5 py-4 font-medium">Question count</th>
                <th className="px-5 py-4 font-medium">Status</th>
                <th className="px-5 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(settingsQuery.data || []).map((setting) => (
                <DifficultyRow key={setting.difficulty} setting={setting} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
