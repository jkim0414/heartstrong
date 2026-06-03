import { useState } from 'react'
import { useStore } from '../state/store'
import { Button, Card } from './ui'
import { formatLong, parseISODate, toISODate, todayISO } from '../lib/date'
import type { DayStatus } from '../types'

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const STATUS_DOT: Record<DayStatus, string> = {
  completed: 'bg-emerald-500',
  rest: 'bg-sky-400',
  skipped: 'bg-slate-300',
}

export function History() {
  const { state, today } = useStore()
  const [cursor, setCursor] = useState(() => {
    const d = parseISODate(today)
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [selected, setSelected] = useState<string | null>(null)

  const firstOfMonth = new Date(cursor.year, cursor.month, 1)
  const startPad = firstOfMonth.getDay()
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate()

  const cells: (string | null)[] = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(toISODate(new Date(cursor.year, cursor.month, d)))

  const shift = (delta: number) => {
    const m = cursor.month + delta
    setCursor({ year: cursor.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 })
    setSelected(null)
  }

  // Count this month's completions for a quick header stat.
  const monthCompleted = cells.filter((c) => c && state.log[c]?.status === 'completed').length

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-slate-900">History</h1>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <button onClick={() => shift(-1)} className="rounded-lg px-3 py-2 text-xl text-slate-500 hover:bg-slate-100" aria-label="Previous month">
            ‹
          </button>
          <div className="text-center">
            <p className="text-lg font-bold text-slate-900">
              {MONTHS[cursor.month]} {cursor.year}
            </p>
            <p className="text-xs text-slate-500">{monthCompleted} workouts this month</p>
          </div>
          <button onClick={() => shift(1)} className="rounded-lg px-3 py-2 text-xl text-slate-500 hover:bg-slate-100" aria-label="Next month">
            ›
          </button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1 text-center">
          {DOW.map((d, i) => (
            <div key={i} className="py-1 text-xs font-bold text-slate-400">
              {d}
            </div>
          ))}
          {cells.map((iso, i) => {
            if (!iso) return <div key={i} />
            const entry = state.log[iso]
            const isToday = iso === today
            const isFuture = iso > today
            const dayNum = parseISODate(iso).getDate()
            return (
              <button
                key={i}
                onClick={() => setSelected(iso)}
                disabled={isFuture}
                className={`relative flex aspect-square flex-col items-center justify-center rounded-lg text-base ${
                  selected === iso ? 'ring-2 ring-brand-500' : ''
                } ${isToday ? 'bg-brand-50 font-extrabold text-brand-800' : 'text-slate-700'} ${
                  isFuture ? 'text-slate-300' : 'hover:bg-slate-100'
                }`}
              >
                {dayNum}
                {entry && <span className={`absolute bottom-1.5 h-1.5 w-1.5 rounded-full ${STATUS_DOT[entry.status]}`} />}
              </button>
            )
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Workout</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-400" /> Rest</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-300" /> Skipped</span>
        </div>
      </Card>

      {selected && <DayDetail date={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function DayDetail({ date, onClose }: { date: string; onClose: () => void }) {
  const { state, workoutFor, setDayStatus, clearDay } = useStore()
  const entry = state.log[date]
  const workout = workoutFor(date)
  const isPastOrToday = date <= todayISO()

  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between">
        <p className="text-lg font-bold text-slate-900">{formatLong(date)}</p>
        <button onClick={onClose} className="text-sm text-slate-400">
          Close
        </button>
      </div>

      {entry ? (
        <div className="space-y-1">
          <p className="text-base font-semibold text-slate-800">
            {entry.status === 'completed' ? '✅ Completed' : entry.status === 'rest' ? '😴 Rest day' : '⏭ Skipped'}
            {entry.workoutTitle ? ` · ${entry.workoutTitle}` : ''}
          </p>
          {entry.feltRpe != null && <p className="text-sm text-slate-600">Felt like {entry.feltRpe}/10 effort</p>}
          {entry.notes && <p className="text-base italic text-slate-700">“{entry.notes}”</p>}
          <Button variant="ghost" className="!px-2 !text-sm" onClick={() => clearDay(date)}>
            Clear this day
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-base text-slate-600">
            Planned: <span className="font-semibold text-slate-800">{workout.title}</span>
          </p>
          {isPastOrToday && (
            <div className="flex gap-2">
              <Button variant="success" full onClick={() => setDayStatus(date, 'completed', { workoutTitle: workout.title })}>
                Mark done
              </Button>
              <Button variant="secondary" full onClick={() => setDayStatus(date, 'rest', { workoutTitle: 'Rest day' })}>
                Rest
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
