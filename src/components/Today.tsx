import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { PHASES } from '../data/phases'
import { Button, Card, Pill } from './ui'
import { WorkoutView } from './WorkoutView'
import { ReadinessCheck } from './ReadinessCheck'
import { addDays, formatLong, weekday } from '../lib/date'
import { determinePhase } from '../engine/phase'
import { getEligibleMovements } from '../engine/generator'
import { cachedPlanUsable } from '../engine/plan'
import { MOVEMENTS_BY_ID } from '../data/movements'
import { fetchAiWeek, fetchAiWorkout } from '../engine/llm'
import { Glossarize } from './Glossarize'
import { StreakCelebration } from './StreakCelebration'
import type { ISODate } from '../types'

// The weekly plan request (one call, often 30–60s). Module-level so it
// survives the Today screen unmounting (switching tabs mid-generation used to
// throw the result away and pay for it again) and so two mounts can't race.
let weekRequest: Promise<void> | null = null
let regenSalt = 0
/** Longest the "planning your week" spinner may stand in for the workout. */
const AI_MAX_WAIT_MS = 40_000

export function Today() {
  const { today, workoutFor, planFor, phaseResult, state, stats, setDayStatus, clearDay, setOverride, updateProfile, setAiWorkout, setAiWorkouts, clearAiWorkout, recentTitles, recentPatternsFor, sync, retrySync } = useStore()
  const deterministic = workoutFor(today)
  const entry = state.log[today]
  const readiness = state.readiness[today]
  const override = state.overrides[today]
  const def = PHASES[phaseResult.phase]

  // A cached AI plan is used only if it's still valid under the current rules
  // (same phase, every movement still eligible with today's equipment and
  // precautions) — see engine/plan.ts.
  const aiFresh = cachedPlanUsable(state.aiCache[today], today, state)
  const aiEligible = state.profile.aiEnabled && !override && !deterministic.isRecovery
  const plan = planFor(today)

  const [aiLoading, setAiLoading] = useState(() => weekRequest != null)
  // If the weekly plan is taking too long we show the built-in plan instead —
  // and then keep it for this visit, so the workout never changes under
  // someone who has already started reading it.
  const [aiGaveUp, setAiGaveUp] = useState(false)
  const workout = aiGaveUp ? deterministic : plan.workout
  const usingAi = !aiGaveUp && plan.isAi
  const [regenerating, setRegenerating] = useState(false)
  const [regenFailed, setRegenFailed] = useState(false)
  const [showWhy, setShowWhy] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [confirmSternal, setConfirmSternal] = useState(false)
  const [celebrateStreak, setCelebrateStreak] = useState<number | null>(null)

  // Which upcoming days still need an AI plan? Programming is set as a weekly
  // block (today through Saturday; when the week is nearly over, next week
  // too), not improvised per day. Skipped: rest/recovery days (deterministic
  // by design), days already planned for the current phase, overridden days,
  // and days whose phase differs from today's — those regenerate when reached,
  // against the right phase's movement list.
  const neededAiDates = (): ISODate[] => {
    if (!state.profile.aiEnabled) return []
    const weekEnd = addDays(today, 6 - weekday(today))
    const horizon = weekday(today) >= 5 ? addDays(weekEnd, 7) : weekEnd
    const out: ISODate[] = []
    for (let d = today; d <= horizon; d = addDays(d, 1)) {
      if (determinePhase(state.profile, d, state.log).phase !== phaseResult.phase) continue
      if (cachedPlanUsable(state.aiCache[d], d, state)) continue
      if (state.overrides[d]) continue
      if (workoutFor(d).isRecovery) continue
      out.push(d)
    }
    return out
  }

  // Short adherence note so the weekly planner can ease back in after misses.
  const adherenceSummary = (): string => {
    let done = 0
    let rest = 0
    let missed = 0
    for (let i = 1; i <= 7; i++) {
      const d = addDays(today, -i)
      const e = state.log[d]
      if (e?.status === 'completed') done++
      else if (e?.status === 'rest') rest++
      else if (!workoutFor(d).isRecovery) missed++
    }
    return `over the last 7 days they completed ${done}, logged ${rest} rest, missed ${missed}.`
  }

  // Recent training actuals — what was prescribed vs how it landed — so the
  // planner can progress loads/volume deliberately instead of guessing.
  const recentActuals = (): string => {
    const lines: string[] = []
    for (let i = 1; i <= 14 && lines.length < 8; i++) {
      const d = addDays(today, -i)
      const e = state.log[d]
      if (e?.status !== 'completed') continue
      const ai = state.aiCache[d]
      const loads = ai
        ? ai.blocks
            .flatMap((b) => b.items)
            .filter((it) => it.loadLb != null)
            .map((it) => `${it.movementId}@${it.loadLb}`)
            .join(', ')
        : ''
      const parts = [
        `${d}: "${e.workoutTitle ?? 'workout'}"`,
        ai ? `prescribed RPE ${ai.rpeLow}-${ai.rpeHigh}` : '',
        loads ? `loads: ${loads}` : '',
        e.feltRpe != null ? `felt RPE ${e.feltRpe}` : '',
        e.loadFeel ? `weights felt: ${e.loadFeel === 'light' ? 'too light' : e.loadFeel === 'heavy' ? 'too heavy' : 'about right'}` : '',
        e.score ? `score: ${e.score}` : '',
      ].filter(Boolean)
      lines.push(parts.join(' · '))
    }
    return lines.reverse().join('\n')
  }

  // Owned equipment that recent programming hasn't touched — surface it to the
  // planner so the movement pool doesn't quietly narrow (e.g. a new rower).
  // Only gear with at least one movement eligible right now: listing custom
  // gear (no movements in the library) or phase-locked gear would push the
  // planner toward movements it can't legally produce.
  const underusedEquipment = (): string[] => {
    const usable = new Set(getEligibleMovements(phaseResult.phase, state.profile, state.equipment).flatMap((m) => m.requires))
    const used = new Set<string>()
    for (let i = 0; i <= 14; i++) {
      const ai = state.aiCache[addDays(today, -i)]
      if (!ai) continue
      for (const b of ai.blocks) for (const it of b.items) {
        const m = MOVEMENTS_BY_ID[it.movementId]
        for (const r of m?.requires ?? []) used.add(r)
      }
    }
    return state.equipment
      .filter((e) => e.owned && usable.has(e.id) && e.id !== 'bodyweight' && e.id !== 'openspace' && !used.has(e.id))
      .map((e) => e.label)
  }

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    // The planner verifies the session with the account server; when that's
    // unreachable the request can only hang and fail, so don't make it.
    if (sync === 'unreachable') return
    let mounted = true
    if (!weekRequest) {
      const needed = neededAiDates()
      if (needed.length === 0) return
      // Only show a spinner when TODAY is waiting; later days fill in quietly.
      if (needed[0] === today) setAiLoading(true)
      weekRequest = fetchAiWeek(needed, phaseResult.phase, state.profile, state.equipment, recentTitles(), recentPatternsFor(needed[0]), {
        adherence: adherenceSummary(),
        recentActuals: recentActuals(),
        underusedEquipment: underusedEquipment(),
      })
        // Store writes are safe after unmount; stale-phase or now-ineligible
        // days are filtered out at display time by cachedPlanUsable.
        .then((w) => {
          if (w) setAiWorkouts(w)
        })
        .finally(() => {
          weekRequest = null
        })
    }
    weekRequest?.finally(() => {
      if (mounted) setAiLoading(false)
    })
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiEligible, aiFresh, today, phaseResult.phase, sync])

  // Never leave someone staring at a spinner: after a generous wait, fall back
  // to the built-in plan for this visit.
  const waitingOnAi = aiLoading && !aiFresh && aiEligible && !aiGaveUp
  useEffect(() => {
    if (!waitingOnAi) return
    const t = setTimeout(() => setAiGaveUp(true), AI_MAX_WAIT_MS)
    return () => clearTimeout(t)
  }, [waitingOnAi])

  // "New variation": re-roll just today. The current workout stays on screen
  // until a validated replacement arrives, so a failed request costs nothing.
  const regenerate = async () => {
    if (regenerating) return
    setRegenerating(true)
    setRegenFailed(false)
    const w = await fetchAiWorkout(today, phaseResult.phase, state.profile, state.equipment, recentTitles(), recentPatternsFor(today), ++regenSalt)
    if (w) {
      setAiWorkout(today, w)
      setAiGaveUp(false)
    } else setRegenFailed(true)
    setRegenerating(false)
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

      {/* Account unreachable — calm, but visible: silent sync failures go unnoticed for months */}
      {sync === 'unreachable' && (
        <Card className="border-l-4 border-slate-400 p-4">
          <p className="text-base font-semibold text-slate-800">Can’t reach your account right now</p>
          <p className="mt-1 text-sm text-slate-600">
            Your workouts are still being saved on this device and will sync once it reconnects. If you keep seeing
            this for more than a day, let the person who set up the app know.
          </p>
          <Button variant="secondary" className="mt-2 !py-2 !text-sm" onClick={retrySync}>
            Try again
          </Button>
        </Card>
      )}

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
            {phaseResult.weeksPostOp != null && <p className="text-xs text-slate-500">Week {phaseResult.weeksPostOp} post-op</p>}
          </div>
        )}
      </Card>

      {/* Completed / rest states */}
      {entry?.status === 'completed' && (
        <Card className="border-l-4 border-emerald-500 bg-emerald-50 p-4">
          <p className="text-base font-bold text-emerald-900">✅ Done for today — nice work!</p>
          {entry.feltRpe != null && <p className="mt-0.5 text-sm text-emerald-900">You rated it {entry.feltRpe}/10 effort.</p>}
          {(entry.loadFeel || entry.score) && (
            <p className="mt-0.5 text-sm text-emerald-900">
              {entry.loadFeel ? `Weights: ${LOAD_FEEL_LABEL[entry.loadFeel].toLowerCase()}` : ''}
              {entry.loadFeel && entry.score ? ' · ' : ''}
              {entry.score ? `Score: ${entry.score}` : ''}
            </p>
          )}
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
        waitingOnAi || regenerating ? (
          <Card className="flex items-center gap-3 p-6">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700" />
            <span className="text-base font-semibold text-slate-700">
              {regenerating ? 'Creating a new variation…' : 'Planning your week…'}
            </span>
          </Card>
        ) : (
          <>
            {aiEligible && (
              <div className="flex items-center justify-between px-1">
                <span className="text-sm font-medium text-slate-500">{usingAi ? '✨ AI-planned' : 'Built-in plan'}</span>
                {sync !== 'unreachable' && (
                  <button onClick={regenerate} className="py-1 text-base font-semibold text-brand-700">↻ New variation</button>
                )}
              </div>
            )}
            {regenFailed && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
                Couldn’t get a new variation right now — keeping this one.
              </p>
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
              hadLoads={workout.blocks.some((b) => b.items.some((it) => it.loadLb != null))}
              hadMetcon={workout.blocks.some((b) => b.block === 'metcon')}
              onCancel={() => setCompleting(false)}
              onSave={(notes, feltRpe, loadFeel, score) => {
                setDayStatus(today, 'completed', { notes, feltRpe, loadFeel, score, workoutTitle: workout.title })
                // If the built-in plan stood in for a slow AI plan, drop any AI
                // plan that arrived late so history shows what was actually done.
                if (aiGaveUp) clearAiWorkout(today)
                setCompleting(false)
                // Today isn't counted until it's logged, so completing it adds one.
                setCelebrateStreak(stats.currentStreak + 1)
              }}
            />
          )}
        </div>
      )}

      {celebrateStreak != null && (
        <StreakCelebration streak={celebrateStreak} onClose={() => setCelebrateStreak(null)} />
      )}
    </div>
  )
}

const LOAD_FEEL_LABEL = { light: 'Too light', right: 'About right', heavy: 'Too heavy' } as const

function CompletePanel({
  hadLoads,
  hadMetcon,
  onSave,
  onCancel,
}: {
  hadLoads: boolean
  hadMetcon: boolean
  onSave: (notes: string, feltRpe?: number, loadFeel?: 'light' | 'right' | 'heavy', score?: string) => void
  onCancel: () => void
}) {
  const [notes, setNotes] = useState('')
  const [rpe, setRpe] = useState<number | undefined>(undefined)
  const [loadFeel, setLoadFeel] = useState<'light' | 'right' | 'heavy' | undefined>(undefined)
  const [score, setScore] = useState('')
  return (
    <Card className="space-y-4 p-5">
      <p className="text-lg font-bold text-slate-900">How did it go?</p>
      <div>
        <p className="text-sm font-semibold text-slate-700">How hard did it feel? (optional)</p>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setRpe(n === rpe ? undefined : n)}
              aria-pressed={rpe === n}
              className={`rounded-lg py-3 text-lg font-bold ${rpe === n ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-700'}`}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-sm text-slate-500">1 = very easy · 10 = all-out (you should rarely go above 7–8)</p>
      </div>
      {hadLoads && (
        <div>
          <p className="text-sm font-semibold text-slate-700">How were the weights? (optional)</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(['light', 'right', 'heavy'] as const).map((id) => (
              <button
                key={id}
                onClick={() => setLoadFeel(id === loadFeel ? undefined : id)}
                aria-pressed={loadFeel === id}
                className={`rounded-lg py-3 text-base font-semibold ${loadFeel === id ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-700'}`}
              >
                {LOAD_FEEL_LABEL[id]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-sm text-slate-500">This helps next week’s plan pick better weights.</p>
        </div>
      )}
      {hadMetcon && (
        <div>
          <p className="text-sm font-semibold text-slate-700">Score (optional)</p>
          <input
            value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder="e.g. 4 rounds + 10, or 12:30"
            className="mt-2 w-full rounded-xl border-0 bg-slate-100 px-4 py-3 text-base ring-1 ring-slate-200 focus:ring-2 focus:ring-brand-500"
          />
        </div>
      )}
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
        <Button variant="success" full onClick={() => onSave(notes.trim(), rpe, loadFeel, score.trim() || undefined)}>
          Save
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  )
}
