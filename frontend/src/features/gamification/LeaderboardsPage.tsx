import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getActiveCategoriesForLeaderboard, getLeaderboard } from '@/features/gamification/api';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import { createCsv, downloadTextFile, formatNumber } from '@/lib/utils';

const scopeOptions = [
  { value: 'global', label: 'Global' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'category', label: 'By category' },
] as const;

export function LeaderboardsPage() {
  const [scope, setScope] = useState<'global' | 'weekly' | 'category'>('global');
  const [limit, setLimit] = useState(10);
  const [categoryId, setCategoryId] = useState<number | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ['leaderboard-categories'],
    queryFn: getActiveCategoriesForLeaderboard,
  });

  const leaderboardQuery = useQuery({
    queryKey: ['leaderboard', { scope, limit, categoryId }],
    queryFn: () => getLeaderboard({ scope, limit, categoryId }),
    enabled: scope !== 'category' || Boolean(categoryId),
  });
  const isInitialLoading = leaderboardQuery.isPending && !leaderboardQuery.data && (scope !== 'category' || Boolean(categoryId));

  const exportRows = useMemo(() => {
    return (leaderboardQuery.data || []).map((entry) => ({
      rank: entry.rank,
      fullName: entry.fullName,
      totalPoints: entry.totalPoints,
      currentLevelId: entry.currentLevelId || '',
    }));
  }, [leaderboardQuery.data]);

  function exportCsv() {
    downloadTextFile(`leaderboard-${scope}.csv`, createCsv(exportRows), 'text/csv;charset=utf-8');
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gamification"
        title="Leaderboards"
        description="View the latest global, weekly, and category-scoped rankings, then export the current list for operations or reporting."
      >
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1">
          {scopeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                scope === option.value ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
              onClick={() => setScope(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <Select
          className="sm:w-28"
          aria-label="Leaderboard limit"
          value={limit}
          onChange={(event) => setLimit(Number(event.target.value))}
        >
          {[10, 25, 50, 100].map((value) => (
            <option key={value} value={value}>
              Top {value}
            </option>
          ))}
        </Select>

        {scope === 'category' ? (
          <Select
            className="sm:w-56"
            aria-label="Leaderboard category"
            value={categoryId || ''}
            onChange={(event) => setCategoryId(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">Select category</option>
            {(categoriesQuery.data || []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        ) : null}

        <Button variant="secondary" onClick={exportCsv} disabled={!leaderboardQuery.data?.length}>
          Export CSV
        </Button>
      </PageHeader>

      <Card className="overflow-hidden">
        {isInitialLoading ? (
          <div className="p-6">
            <EmptyState
              title="Loading leaderboard..."
              description="Fetching the latest rankings for the current scope."
            />
          </div>
        ) : scope === 'category' && !categoryId ? (
          <div className="p-6">
            <EmptyState
              title="Choose a category to load this leaderboard"
              description="Category-scoped rankings are only available once a category filter is selected."
            />
          </div>
        ) : leaderboardQuery.data?.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-medium">Rank</th>
                  <th className="px-5 py-4 font-medium">User</th>
                  <th className="px-5 py-4 font-medium">Points</th>
                  <th className="px-5 py-4 font-medium">Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaderboardQuery.data.map((entry) => (
                  <tr key={`${scope}-${entry.userId}`}>
                    <td className="px-5 py-4">
                      <Badge>#{entry.rank}</Badge>
                    </td>
                    <td className="px-5 py-4 font-medium text-slate-900">{entry.fullName}</td>
                    <td className="px-5 py-4 text-slate-600">{formatNumber(entry.totalPoints)}</td>
                    <td className="px-5 py-4 text-slate-600">{entry.currentLevelId || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6">
            <EmptyState
              title="No leaderboard data found"
              description="Once users have started playing, leaderboard results will appear here."
            />
          </div>
        )}
      </Card>
    </div>
  );
}
