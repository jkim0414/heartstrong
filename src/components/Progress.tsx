import { useStore } from '../state/store'
import { Card } from './ui'

export function Progress() {
  const { stats } = useStore()
  const weekPct = Math.min(100, Math.round((stats.thisWeekCount / stats.thisWeekGoal) * 100))

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-slate-900">Your progress</h1>

      <div className="grid grid-cols-2 gap-3">
        <StatCard emoji="🔥" value={stats.currentStreak} label="Current streak" sub="days" />
        <StatCard emoji="🏆" value={stats.longestStreak} label="Longest streak" sub="days" />
        <StatCard emoji="✅" value={stats.totalWorkouts} label="Total workouts" />
        <StatCard emoji="📅" value={`${stats.thisWeekCount}/${stats.thisWeekGoal}`} label="This week" />
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-slate-900">This week’s goal</p>
          <p className="text-sm font-semibold text-slate-500">{stats.thisWeekCount} of {stats.thisWeekGoal} active days</p>
        </div>
        <div className="mt-3 h-4 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${weekPct}%` }} />
        </div>
        <p className="mt-2 text-sm text-slate-500">
          {stats.thisWeekCount >= stats.thisWeekGoal
            ? '🎉 Goal hit — wonderful consistency this week!'
            : 'Aim for most days of the week. Rest days count toward your recovery, too.'}
        </p>
      </Card>

      <Card className="p-5">
        <p className="text-base font-bold text-slate-900">Milestones</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {stats.milestones.map((m) => (
            <div
              key={m.id}
              className={`rounded-2xl p-3 text-center ring-1 ${m.earned ? 'bg-amber-50 ring-amber-200' : 'bg-slate-50 ring-slate-200 opacity-60'}`}
            >
              <div className={`text-3xl ${m.earned ? '' : 'grayscale'}`}>{m.emoji}</div>
              <p className="mt-1 text-sm font-bold text-slate-800">{m.label}</p>
              <p className="mt-0.5 text-xs text-slate-500">{m.earned ? m.detail : 'Locked'}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function StatCard({ emoji, value, label, sub }: { emoji: string; value: string | number; label: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="text-2xl">{emoji}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-3xl font-extrabold text-slate-900">{value}</span>
        {sub && <span className="text-sm text-slate-400">{sub}</span>}
      </div>
      <p className="text-sm font-medium text-slate-500">{label}</p>
    </Card>
  )
}
