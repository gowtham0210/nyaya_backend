import { useQuery } from '@tanstack/react-query';
import { Award, BookOpen, Layers3, ShieldQuestion, TrendingUp } from 'lucide-react';
import { getDashboardSummary } from '@/features/dashboard/api';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDateTime, formatNumber } from '@/lib/utils';

export function DashboardPage() {
  const dashboardQuery = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: getDashboardSummary,
  });

  const data = dashboardQuery.data;
  const isInitialLoading = dashboardQuery.isPending && !data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dashboard"
        title="Admin control tower"
        description="Track the health of categories, quizzes, questions, levels, and leaderboard movement from one overview screen."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Active categories" value={formatNumber(data?.stats.activeCategories)}>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <BookOpen className="h-4 w-4 text-teal-600" />
            <span>{formatNumber(data?.stats.totalCategories)} total records</span>
          </div>
        </StatCard>
        <StatCard label="Active quizzes" value={formatNumber(data?.stats.activeQuizzes)}>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Layers3 className="h-4 w-4 text-teal-600" />
            <span>{formatNumber(data?.stats.totalQuizzes)} total records</span>
          </div>
        </StatCard>
        <StatCard label="Active questions" value={formatNumber(data?.stats.activeQuestions)}>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldQuestion className="h-4 w-4 text-teal-600" />
            <span>{formatNumber(data?.stats.totalQuestions)} total records</span>
          </div>
        </StatCard>
        <StatCard label="Attempts today" value={formatNumber(data?.stats.attemptsToday)}>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <TrendingUp className="h-4 w-4 text-teal-600" />
            <span>{formatNumber(data?.stats.activeUsers7d)} active users in 7 days</span>
          </div>
        </StatCard>
        <StatCard label="Levels configured" value={formatNumber(data?.stats.totalLevels)}>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Award className="h-4 w-4 text-teal-600" />
            <span>{formatNumber(data?.stats.activeUsers30d)} active users in 30 days</span>
          </div>
        </StatCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <Card className="p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Top quizzes by attempts</p>
              <p className="text-sm text-slate-500">This helps editors spot the most-used content.</p>
            </div>
            <Badge>{dashboardQuery.isFetching ? 'Refreshing' : 'Live'}</Badge>
          </div>

          {isInitialLoading ? (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              Loading dashboard data...
            </div>
          ) : data?.topQuizzes?.length ? (
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="pb-3 font-medium">Quiz</th>
                    <th className="pb-3 font-medium">Attempts</th>
                    <th className="pb-3 font-medium">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.topQuizzes.map((quiz) => (
                    <tr key={quiz.id}>
                      <td className="py-3">
                        <p className="font-medium text-slate-900">{quiz.title}</p>
                        <p className="text-xs text-slate-500">{quiz.slug}</p>
                      </td>
                      <td className="py-3 text-slate-600">{formatNumber(quiz.totalAttempts)}</td>
                      <td className="py-3 text-slate-600">{formatNumber(quiz.submittedAttempts)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-5">
              <EmptyState
                title="No quiz attempt data yet"
                description="As learners start taking quizzes, the highest-traffic content will appear here."
              />
            </div>
          )}
        </Card>

        <Card className="p-6">
          <p className="text-sm font-semibold text-slate-900">Global leaderboard preview</p>
          <p className="mt-1 text-sm text-slate-500">Top performers across the entire platform.</p>

          {isInitialLoading ? (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              Loading dashboard data...
            </div>
          ) : data?.leaderboardPreview?.length ? (
            <div className="mt-5 space-y-3">
              {data.leaderboardPreview.map((entry) => (
                <div key={entry.userId} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                  <div>
                    <p className="font-medium text-slate-900">
                      #{entry.rank} {entry.fullName}
                    </p>
                    <p className="text-xs text-slate-500">Level {entry.currentLevelId || '—'}</p>
                  </div>
                  <Badge tone="success">{formatNumber(entry.totalPoints)} pts</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5">
              <EmptyState
                title="No leaderboard data yet"
                description="Scores will appear once users begin earning points."
              />
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <p className="text-sm font-semibold text-slate-900">Recently added questions</p>
          <div className="mt-4 space-y-3">
            {isInitialLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                Loading dashboard data...
              </div>
            ) : data?.recentQuestions?.length ? (
              data.recentQuestions.map((question) => (
                <div key={question.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                  <p className="font-medium text-slate-900">{question.questionText}</p>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
                    <span>{question.quizTitle}</span>
                    <span>{formatDateTime(question.createdAt)}</span>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                title="No recent questions"
                description="Create your first question to start building out the content feed."
              />
            )}
          </div>
        </Card>

        <Card className="p-6">
          <p className="text-sm font-semibold text-slate-900">Recent quiz attempts</p>
          <div className="mt-4 space-y-3">
            {isInitialLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                Loading dashboard data...
              </div>
            ) : data?.recentAttempts?.length ? (
              data.recentAttempts.map((attempt) => (
                <div key={attempt.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-slate-900">{attempt.fullName}</p>
                    <Badge tone={attempt.status === 'submitted' ? 'success' : 'warning'}>{attempt.status}</Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
                    <span>{attempt.quizTitle}</span>
                    <span>{formatDateTime(attempt.createdAt)}</span>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                title="No recent attempts"
                description="Attempt activity will start filling this panel once learners engage with quizzes."
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
