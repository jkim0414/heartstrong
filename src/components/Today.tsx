import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { PHASES } from '../data/phases'
import { Button, Card, Pill } from './ui'
import { WorkoutView } from './WorkoutView'
import { ReadinessCheck } from './ReadinessCheck'
import { formatLong } from '../lib/date'
import { fetchAiWorkout } from '../engine/llm'
import { Glossarize } from './Glossarize'

export function Today() {
  const { today, workoutFor, phaseResult, state, stats, setDayStatus, clearDay, setOverride, updateProfile, setAiWorkout, clearAiWorkout, recentTitles } = useStore()
  const deterministic = workoutFor(today)
  const entry = state.log[today]
  const readiness = state.readiness[today]
  const override = state.overrides[today]
  const def = PHASES[phaseResult.phase]

  const ai = state.aiCache[today]
  // A cached AI workout is only valid if it was generated for the current phase
  // — otherwise (e.g. after sternal precautions lift mid-day) it's stale.
  const aiFresh = !!ai && ai.phase === phaseResult.phase
  const aiEligible = state.profile.aiEnabled && !override && !deterministic.isRecovery
  const workout = aiEligible && aiFresh ? ai : deterministic
  const usingAi = aiEligible && aiFresh

  const [salt, setSalt] = useState(0)
  const [aiLoading, setAiLoading] = useState(false)
  const [showWhy, setShowWhy] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [confirmSternal, setConfirmSternal] = useState(false)

  useEffect(() => {
    if (!aiEligible || aiFresh) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    let cancelled = false
    setAiLoading(true)
    fetchAiWorkout(today, phaseResult.phase, state.profile, state.equipment, recentTitles(), salt).then((w) => {
      if (cancelled) return
      if (w) setAiWorkout(today, w)
      setAiLoading(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiEligible, aiFresh, today, phaseResult.phase, salt])

  const regenerate = () => {
    clearAiWorkout(today)
    setSalt((s) => s + 1)
  }

  const showWorkout = revealed || !!readiness?.ok || !!entry || workout.isRecovery
  const greeting = state.profile.name ? `Hi ${state.profile.name}` : 'Welcome back'

  return (
    <div className="space-y-3">
      {/* Compact header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{greeting} ·</p>
          <h1 className="text-2xl font-extrabold leading-tight text-slate-900">{formatLong(today)}</h1>
        </div>
        {stats.currentStreak > 0 && <Pill tone="amber">🔥 {stats.currentStreak}</Pill>}
      </div>

      {/* Clearance nudge — compact, only when not cleared */}
      {!state.profile.clearedForExercise && (
        <Card className="border-l-4 border-amber-500 bg-amber-50 p-4">
          <p className="text-base font-semibold text-amber-900">Get your doctor’s green light first</p>
          <p className="mt-1 text-sm text-amber-900">
            Until then we keep to gentle walking and breathing — safe and still valuable.
          </p>
          <Button variant="secondary" className="mt-2 !py-2 !text-sm" onClick={() => updateProfile({ clearedForExercise: true })}>
            I’ve been cleared
          </Button>
        </Card>
      )}

      {/* Sternal-precautions prompt — the one transition that needs a human tap */}
      {state.profile.clearedForExercise && !state.profile.sternalPrecautionsLifted && (
        <Card className="border-l-4 border-amber-500 bg-amber-50 p-4">
          <p className="text-base font-semibold text-amber-900">Has your surgeon cleared your breastbone?</p>
          <p className="mt-1 text-sm text-amber-900">
            You’re in the gentle phase while the breastbone heals — usually about 6–8 weeks
            {phaseResult.weeksPostOp != null ? ` (you’re at week ${phaseResult.weeksPostOp})` : ''}. When your surgeon
            says it’s healed, mark it here to unlock strength training.
          </p>
          {!confirmSternal ? (
            <Button variant="secondary" className="mt-2 !py-2 !text-sm" onClick={() => setConfirmSternal(true)}>
              My surgeon cleared it
            </Button>
          ) : (
            <div className="mt-2 space-y-2">
              <p className="text-sm font-semibold text-amber-900">
                This unlocks pushing, pulling, and lifting with your arms. Has your surgeon confirmed the breastbone is healed?
              </p>
              <div className="flex gap-2">
                <Button
                  variant="success"
                  className="!py-2 !text-sm"
                  onClick={() => {
                    updateProfile({ sternalPrecautionsLifted: true })
                    setConfirmSternal(false)
                  }}
                >
                  Yes — unlock strength
                </Button>
                <Button variant="ghost" className="!py-2 !text-sm" onClick={() => setConfirmSternal(false)}>
                  Not yet
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Summary — compact, with collapsible "why" */}
      <Card>
        <div className="rounded-t-2xl bg-gradient-to-br from-brand-700 to-brand-800 p-4 text-white">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-100">Today · {def.name}</p>
            <span className="text-xs font-medium text-brand-100">{usingAi ? '✨ for you' : ''}</span>
          </div>
          <h2 className="mt-0.5 text-xl font-extrabold">
            <Glossarize text={workout.title} />
          </h2>
          <p className="mt-1 text-sm text-brand-50">
            <Glossarize text={workout.summary} />
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            {!workout.isRecovery && <span className="rounded-lg bg-white/15 px-2.5 py-1 font-semibold">⏱ ~{workout.estMinutes} min</span>}
            <span className="rounded-lg bg-white/15 px-2.5 py-1 font-semibold">💪 Effort {workout.rpeLow}–{workout.rpeHigh}/10</span>
            <span className="text-xs text-brand-100">
              · <Glossarize text={`talk test: ${workout.talkTest.replace(/\.$/, '')}`} />
            </span>
          </div>
        </div>
        <button onClick={() => setShowWhy((v) => !v)} className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-slate-500">
          <span>Why this plan?</span>
          <span className={`transition-transform ${showWhy ? 'rotate-180' : ''}`}>⌄</span>
        </button>
        {showWhy && (
          <div className="space-y-2 border-t border-slate-100 px-4 py-3">
            <p className="text-sm text-slate-600">{phaseResult.reason}</p>
            {phaseResult.nudge && <p className="text-sm font-medium text-brand-800">💡 {phaseResult.nudge}</p>}
            {phaseResult.weeksPostOp != null && <p className="text-xs text-slate-400">Week {phaseResult.weeksPostOp} post-op</p>}
          </div>
        )}
      </Card>

      {/* Completed / rest states */}
      {entry?.status === 'completed' && (
        <Card className="border-l-4 border-emerald-500 bg-emerald-50 p-4">
          <p className="text-base font-bold text-emerald-900">✅ Done for today — nice work!</p>
          {entry.feltRpe != null && <p className="mt-0.5 text-sm text-emerald-900">You rated it {entry.feltRpe}/10 effort.</p>}
          {entry.notes && <p className="mt-0.5 text-sm italic text-emerald-800">“{entry.notes}”</p>}
          <button className="mt-1 text-sm font-semibold text-emerald-800 underline" onClick={() => clearDay(today)}>Undo</button>
        </Card>
      )}
      {entry?.status === 'rest' && (
        <Card className="border-l-4 border-sky-500 bg-sky-50 p-4">
          <p className="text-base font-bold text-sky-900">😴 Rest day logged</p>
          <p className="mt-0.5 text-sm text-sky-900">Rest is part of getting stronger. Your streak is safe.</p>
          <button className="mt-1 text-sm font-semibold text-sky-800 underline" onClick={() => clearDay(today)}>Undo</button>
        </Card>
      )}

      {/* Readiness gate */}
      {!entry && !workout.isRecovery && !showWorkout && <ReadinessCheck date={today} onPass={() => setRevealed(true)} />}

      {/* Workout */}
      {showWorkout && !entry && (
        aiLoading && !aiFresh && aiEligible ? (
          <Card className="flex items-center gap-3 p-6">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700" />
            <span className="text-base font-semibold text-slate-700">Creating a fresh workout for today…</span>
          </Card>
        ) : (
          <>
            {aiEligible && (
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-medium text-slate-400">{usingAi ? '✨ AI-generated' : 'Built-in plan (offline)'}</span>
                <button onClick={regenerate} className="text-sm font-semibold text-brand-700">↻ New variation</button>
              </div>
            )}
            <WorkoutView workout={workout} />
          </>
        )
      )}

      {/* Actions */}
      {!entry && showWorkout && (
        <div className="space-y-2">
          {!completing ? (
            <>
              <Button variant="success" full className="!py-4 !text-lg" onClick={() => setCompleting(true)}>
                ✓ Mark today complete
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" full onClick={() => setDayStatus(today, 'rest', { workoutTitle: 'Rest day' })}>
                  Log rest day
                </Button>
                {!workout.isRecovery && override !== 'easier' && (
                  <Button variant="ghost" full onClick={() => setOverride(today, 'easier')}>
                    Make it easier
                  </Button>
                )}
                {override && (
                  <Button variant="ghost" full onClick={() => setOverride(today, null)}>
                    Restore plan
                  </Button>
                )}
              </div>
            </>
          ) : (
            <CompletePanel
              onCancel={() => setCompleting(false)}
              onSave={(notes, feltRpe) => {
                setDayStatus(today, 'completed', { notes, feltRpe, workoutTitle: workout.title })
                setCompleting(false)
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

function CompletePanel({ onSave, onCancel }: { onSave: (notes: string, feltRpe?: number) => void; onCancel: () => void }) {
  const [notes, setNotes] = useState('')
  const [rpe, setRpe] = useState<number | undefined>(undefined)
  return (
    <Card className="space-y-4 p-5">
      <p className="text-lg font-bold text-slate-900">How did it go?</p>
      <div>
        <p className="text-sm font-semibold text-slate-700">How hard did it feel? (optional)</p>
        <div className="mt-2 grid grid-cols-10 gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setRpe(n === rpe ? undefined : n)}
              className={`rounded-lg py-2 text-sm font-bold ${rpe === n ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-400">1 = very easy · 10 = maximal (you should rarely go above 7–8)</p>
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700">Notes (optional)</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="How you felt, anything you changed, questions for your care team…"
          className="mt-2 w-full rounded-xl border-0 bg-slate-100 px-4 py-3 text-base ring-1 ring-slate-200 focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <div className="flex gap-2">
        <Button variant="success" full onClick={() => onSave(notes.trim(), rpe)}>
          Save
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  )
}
