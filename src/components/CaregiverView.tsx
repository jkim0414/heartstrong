import { useEffect, useMemo, useRef, useState } from 'react'
import { getPatientState } from '../lib/care'
import { computeStats, type Stats } from '../state/store'
import { determinePhase } from '../engine/phase'
import { generateWorkout } from '../engine/generator'
import { PHASES } from '../data/phases'
import { todayISO, formatLong, parseISODate, toISODate, addDays } from '../lib/date'
import type { AppState, DayStatus, ISODate, LogEntry, Workout } from '../types'
import { Card } from './ui'
import { WorkoutView } from './WorkoutView'

const PHASE_TONE: Record<number, string> = { 1: 'bg-sky-100 text-sky-800', 2: 'bg-teal-100 text-teal-800', 3: 'bg-emerald-100 text-emerald-800', 4: 'bg-emerald-100 text-emerald-800' }
const STATUS_DOT: Record<DayStatus, string> = { completed: 'bg-emerald-500', rest: 'bg-sky-400', skipped: 'bg-slate-300' }
const STATUS_LABEL: Record<DayStatus, string> = { completed: '✅ Workout', rest: '😴 Rest', skipped: '⏭ Skipped' }
const FLAG_LABELS: Record<string, string> = {
  chest: 'chest pain or pressure',
  breath: 'more short of breath',
  dizzy: 'dizzy or lightheaded',
  heartbeat: 'irregular heartbeat',
  incision: 'incision pain',
  unwell: 'feeling unwell',
  swelling: 'leg swelling / weight up',
}
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function workoutForDay(state: AppState, date: ISODate): Workout {
  const ov = state.overrides[date]
  const force = ov === 'rest' ? 'rest' : ov === 'easier' ? 'recovery_mobility' : undefined
  const pr = determinePhase(state.profile, date)
  const det = generateWorkout(date, pr.phase, state.profile, state.equipment, force)
  return state.aiCache[date] && !ov ? state.aiCache[date] : det
}

export function CaregiverView({ patientId, label, onClose }: { patientId: string; label: string; onClose: () => void }) {
  const [state, setState] = useState<AppState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState<ISODate | null>(null)
  const today = todayISO()
  const [cursor, setCursor] = useState(() => {
    const d = parseISODate(today)
    return { year: d.getFullYear(), month: d.getMonth() }
  })

  useEffect(() => {
    let cancelled = false
    getPatientState(patientId)
      .then((s) => {
        if (cancelled) return
        if (!s) setError(true)
        else setState(s)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) { setError(true); setLoading(false) }
      })
    return () => { cancelled = true }
  }, [patientId])

  const derived = useMemo(() => {
    if (!state) return null
    const stats: Stats = computeStats(state, today)
    const phase = determinePhase(state.profile, today)
    const entries = Object.values(state.log).sort((a, b) => (a.date < b.date ? 1 : -1))
    const completed = entries.filter((e) => e.status === 'completed')
    const rpes = completed.map((e) => e.feltRpe).filter((r): r is number => typeof r === 'number')
    const avgRpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null
    const notes = entries.filter((e) => e.notes)
    const flagged = Object.entries(state.readiness)
      .filter(([, r]) => !r.ok && r.flagged.length)
      .map(([date, r]) => ({ date, flagged: r.flagged }))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
    // consistency: completed workouts per week, last 8 weeks (oldest -> newest)
    const weekStart = (d: ISODate) => addDays(d, -parseISODate(d).getDay())
    const thisWeekStart = weekStart(today)
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const start = addDays(thisWeekStart, -(7 - 1 - i) * 7)
      let n = 0
      for (let k = 0; k < 7; k++) if (state.log[addDays(start, k)]?.status === 'completed') n++
      return { start, n }
    })
    return { stats, phase, entries, completed, avgRpe, notes, flagged, weeks }
  }, [state, today])

  // calendar cells
  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1)
    const pad = first.getDay()
    const days = new Date(cursor.year, cursor.month + 1, 0).getDate()
    const out: (ISODate | null)[] = []
    for (let i = 0; i < pad; i++) out.push(null)
    for (let d = 1; d <= days; d++) out.push(toISODate(new Date(cursor.year, cursor.month, d)))
    return out
  }, [cursor])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50">
      <header className="safe-top sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <button onClick={onClose} className="flex items-center gap-1 text-base font-semibold text-brand-700">
          ‹ Back
        </button>
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Following</p>
          <p className="text-base font-bold text-slate-900">{label}</p>
        </div>
        <span className="w-12" />
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700" />
          </div>
        )}
        {!loading && error && (
          <Card className="p-5">
            <p className="text-base text-slate-600">Couldn’t load their data. They may have just started or revoked sharing.</p>
          </Card>
        )}

        {!loading && state && derived && (
          <div className="mx-auto max-w-2xl space-y-4">
            {/* status chips */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${PHASE_TONE[derived.phase.phase]}`}>
                {PHASES[derived.phase.phase].name}
              </span>
              {derived.phase.weeksPostOp != null && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">Week {derived.phase.weeksPostOp} post-op</span>
              )}
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${state.profile.clearedForExercise ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {state.profile.clearedForExercise ? 'Cleared to exercise' : 'Not yet cleared'}
              </span>
              {state.profile.inCardiacRehab && <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">In cardiac rehab</span>}
            </div>

            {/* stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat emoji="🔥" value={derived.stats.currentStreak} label="current streak" />
              <Stat emoji="🏆" value={derived.stats.longestStreak} label="longest streak" />
              <Stat emoji="📅" value={`${derived.stats.thisWeekCount}/${derived.stats.thisWeekGoal}`} label="this week" />
              <Stat emoji="✅" value={derived.stats.totalWorkouts} label="total workouts" />
            </div>

            {/* flagged check-ins (most important for a caregiver) */}
            {derived.flagged.length > 0 && (
              <Card className="border-l-4 border-rose-400 bg-rose-50 p-4">
                <p className="text-base font-bold text-rose-900">⚠ Days they flagged a symptom</p>
                <p className="mt-0.5 text-sm text-rose-800">From the pre-workout check-in. Worth a gentle ask about these.</p>
                <ul className="mt-2 space-y-1.5">
                  {derived.flagged.slice(0, 6).map((f) => (
                    <li key={f.date} className="text-sm text-rose-900">
                      <span className="font-semibold">{formatLong(f.date)}:</span> {f.flagged.map((id) => FLAG_LABELS[id] ?? id).join(', ')}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* consistency trend */}
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-base font-bold text-slate-900">Consistency</p>
                <p className="text-sm text-slate-500">{derived.avgRpe != null ? `avg effort ${derived.avgRpe.toFixed(1)}/10` : 'workouts / week'}</p>
              </div>
              <div className="mt-3 flex items-end justify-between gap-1.5" style={{ height: 72 }}>
                {derived.weeks.map((w, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
                    <div className="w-full rounded-t bg-emerald-400" style={{ height: `${Math.min(w.n, 6) * 10 + (w.n ? 4 : 0)}px` }} title={`${w.n} workouts`} />
                    <span className="text-[10px] text-slate-400">{i === 7 ? 'now' : `-${7 - i}`}</span>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-400">Completed workouts per week (last 8 weeks).</p>
            </Card>

            {/* calendar */}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <button onClick={() => setCursor((c) => { const m = c.month - 1; return { year: c.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 } })} className="rounded-lg px-3 py-2 text-xl text-slate-500 hover:bg-slate-100">‹</button>
                <p className="text-base font-bold text-slate-900">{MONTHS[cursor.month]} {cursor.year}</p>
                <button onClick={() => setCursor((c) => { const m = c.month + 1; return { year: c.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 } })} className="rounded-lg px-3 py-2 text-xl text-slate-500 hover:bg-slate-100">›</button>
              </div>
              <div className="mt-2 grid grid-cols-7 gap-1 text-center">
                {DOW.map((d, i) => <div key={i} className="py-1 text-xs font-bold text-slate-400">{d}</div>)}
                {cells.map((iso, i) => {
                  if (!iso) return <div key={i} />
                  const entry = state.log[iso]
                  const isToday = iso === today
                  const future = iso > today
                  return (
                    <button
                      key={i}
                      disabled={future}
                      onClick={() => setSelected(iso)}
                      className={`relative flex aspect-square flex-col items-center justify-center rounded-lg text-base ${selected === iso ? 'ring-2 ring-brand-500' : ''} ${isToday ? 'bg-brand-50 font-extrabold text-brand-800' : 'text-slate-700'} ${future ? 'text-slate-300' : 'hover:bg-slate-100'}`}
                    >
                      {parseISODate(iso).getDate()}
                      {entry && <span className={`absolute bottom-1.5 h-1.5 w-1.5 rounded-full ${STATUS_DOT[entry.status]}`} />}
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-center text-xs text-slate-400">Tap any day to see what they did.</p>
            </Card>

            {/* day detail */}
            {selected && <DayDetail state={state} date={selected} onClose={() => setSelected(null)} />}

            {/* notes timeline */}
            {derived.notes.length > 0 && (
              <div>
                <p className="px-1 pb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Their notes</p>
                <div className="space-y-2">
                  {derived.notes.slice(0, 12).map((e) => (
                    <button key={e.date} onClick={() => setSelected(e.date)} className="block w-full rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 hover:ring-brand-300">
                      <p className="text-sm font-semibold text-slate-500">{formatLong(e.date)}{e.feltRpe != null ? ` · felt ${e.feltRpe}/10` : ''}</p>
                      <p className="mt-0.5 text-base italic text-slate-800">“{e.notes}”</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function DayDetail({ state, date, onClose }: { state: AppState; date: ISODate; onClose: () => void }) {
  const entry: LogEntry | undefined = state.log[date]
  const readiness = state.readiness[date]
  const workout = workoutForDay(state, date)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [date])
  return (
    <Card ref={ref} className="scroll-mt-4 space-y-3 p-5 ring-2 ring-brand-200">
      <div className="flex items-center justify-between">
        <p className="text-lg font-bold text-slate-900">{formatLong(date)}</p>
        <button onClick={onClose} className="text-sm font-semibold text-slate-400">Close</button>
      </div>

      {entry ? (
        <div>
          <p className="text-base font-semibold text-slate-800">
            {STATUS_LABEL[entry.status]}{entry.workoutTitle ? ` · ${entry.workoutTitle}` : ''}
          </p>
          {entry.feltRpe != null && <p className="text-sm text-slate-600">Rated {entry.feltRpe}/10 effort</p>}
          {entry.notes && <p className="mt-1 text-base italic text-slate-700">“{entry.notes}”</p>}
        </div>
      ) : (
        <p className="text-base text-slate-500">Not logged.</p>
      )}

      {readiness && !readiness.ok && readiness.flagged.length > 0 && (
        <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-900 ring-1 ring-rose-200">
          ⚠ Reported before exercising: {readiness.flagged.map((id) => FLAG_LABELS[id] ?? id).join(', ')}
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">
          {entry?.status === 'completed' ? 'What they did' : 'The plan for this day'}
        </p>
        <WorkoutView workout={workout} />
      </div>
    </Card>
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
