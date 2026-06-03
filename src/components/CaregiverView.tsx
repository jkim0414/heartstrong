import { useEffect, useState } from 'react'
import { getPatientState } from '../lib/care'
import { computeStats, type Stats } from '../state/store'
import { todayISO, formatLong } from '../lib/date'
import type { AppState, LogEntry } from '../types'
import { Button, Card } from './ui'

const STATUS = {
  completed: { emoji: '✅', label: 'Workout' },
  rest: { emoji: '😴', label: 'Rest' },
  skipped: { emoji: '⏭', label: 'Skipped' },
} as const

export function CaregiverView({ patientId, label, onClose }: { patientId: string; label: string; onClose: () => void }) {
  const [state, setState] = useState<AppState | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    getPatientState(patientId)
      .then((s) => {
        if (cancelled) return
        if (!s) {
          setError(true)
        } else {
          setState(s)
          setStats(computeStats(s, todayISO()))
        }
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setError(true)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [patientId])

  const recent: LogEntry[] = state
    ? Object.values(state.log)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 21)
    : []

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/40 backdrop-blur-sm">
      <div className="mt-auto flex max-h-[92vh] flex-col rounded-t-3xl bg-slate-50 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Following</p>
            <h2 className="text-xl font-bold text-slate-900">{label || 'Their progress'}</h2>
          </div>
          <button onClick={onClose} className="rounded-full bg-slate-200 px-4 py-2 text-base font-semibold text-slate-700">
            Close
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700" />
            </div>
          )}

          {!loading && error && (
            <Card className="p-5">
              <p className="text-base text-slate-600">
                Couldn’t load their progress. They may have just started, or revoked sharing.
              </p>
            </Card>
          )}

          {!loading && stats && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Stat emoji="🔥" value={stats.currentStreak} label="streak" />
                <Stat emoji="📅" value={`${stats.thisWeekCount}/${stats.thisWeekGoal}`} label="this week" />
                <Stat emoji="✅" value={stats.totalWorkouts} label="total" />
              </div>

              <div>
                <p className="px-1 pb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Recent days</p>
                {recent.length === 0 ? (
                  <Card className="p-5">
                    <p className="text-base text-slate-600">No logged days yet.</p>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {recent.map((e) => (
                      <Card key={e.date} className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold text-slate-900">
                              {STATUS[e.status].emoji} {formatLong(e.date)}
                            </p>
                            {e.workoutTitle && <p className="text-sm text-slate-500">{e.workoutTitle}</p>}
                          </div>
                          {e.feltRpe != null && (
                            <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-sm font-semibold text-slate-600">
                              effort {e.feltRpe}/10
                            </span>
                          )}
                        </div>
                        {e.notes && <p className="mt-2 text-base italic text-slate-700">“{e.notes}”</p>}
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="border-t border-slate-200 px-4 py-3">
          <Button variant="secondary" full onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}

function Stat({ emoji, value, label }: { emoji: string; value: string | number; label: string }) {
  return (
    <Card className="p-3 text-center">
      <div className="text-2xl">{emoji}</div>
      <div className="mt-0.5 text-2xl font-extrabold text-slate-900">{value}</div>
      <div className="text-xs font-medium text-slate-500">{label}</div>
    </Card>
  )
}
