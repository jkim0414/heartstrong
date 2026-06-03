import { useState } from 'react'
import { READINESS_QUESTIONS, READINESS_FAIL_MESSAGE } from '../data/safety'
import { useStore } from '../state/store'
import { Button, Card } from './ui'

export function ReadinessCheck({ date, onPass }: { date: string; onPass: () => void }) {
  const { setReadiness, setDayStatus } = useStore()
  const [open, setOpen] = useState(false)
  const [answers, setAnswers] = useState<Record<string, boolean>>({})
  const [submitted, setSubmitted] = useState(false)

  const flagged = READINESS_QUESTIONS.filter((q) => answers[q.id]).map((q) => q.id)
  const passed = submitted && flagged.length === 0

  const submit = () => {
    setSubmitted(true)
    setReadiness(date, flagged.length === 0, flagged)
    if (flagged.length === 0) onPass()
  }

  if (!open) {
    return (
      <Card className="border-l-4 border-brand-500 p-5">
        <p className="text-lg font-bold text-slate-900">Quick check before you move</p>
        <p className="mt-1 text-base text-slate-600">A 20-second safety check makes sure today is a good day to exercise.</p>
        <Button full className="mt-4" onClick={() => setOpen(true)}>
          Start today’s check
        </Button>
      </Card>
    )
  }

  if (submitted && !passed) {
    return (
      <Card className="border-l-4 border-amber-500 bg-amber-50 p-5">
        <p className="text-lg font-bold text-amber-900">Let’s rest today</p>
        <p className="mt-2 text-base text-amber-900">{READINESS_FAIL_MESSAGE}</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button
            variant="success"
            full
            onClick={() => setDayStatus(date, 'rest', { workoutTitle: 'Rest (readiness check)' })}
          >
            Log a rest day
          </Button>
          <Button
            variant="secondary"
            full
            onClick={() => {
              setSubmitted(false)
              setAnswers({})
            }}
          >
            Re-check
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <p className="text-lg font-bold text-slate-900">How are you feeling today?</p>
      <p className="mt-1 text-sm text-slate-500">Tap Yes or No for each.</p>
      <div className="mt-4 space-y-3">
        {READINESS_QUESTIONS.map((q) => (
          <div key={q.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <p className="text-base text-slate-800">{q.q}</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => setAnswers((a) => ({ ...a, [q.id]: false }))}
                className={`flex-1 rounded-lg py-2 text-base font-semibold ${answers[q.id] === false ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-300'}`}
              >
                No
              </button>
              <button
                onClick={() => setAnswers((a) => ({ ...a, [q.id]: true }))}
                className={`flex-1 rounded-lg py-2 text-base font-semibold ${answers[q.id] === true ? 'bg-amber-500 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-300'}`}
              >
                Yes
              </button>
            </div>
          </div>
        ))}
      </div>
      <Button
        full
        className="mt-4"
        disabled={READINESS_QUESTIONS.some((q) => answers[q.id] === undefined)}
        onClick={submit}
      >
        Done
      </Button>
    </Card>
  )
}
