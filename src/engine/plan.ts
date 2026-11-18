import type { AppState, ISODate, Pattern, PhaseId, Workout } from '../types'
import { determinePhase } from './phase'
import { generateWorkout, getEligibleMovements, loadedPatternsOf } from './generator'
import { addDays } from '../lib/date'

// ---------------------------------------------------------------------------
// "Which plan applies to this day?" — one answer for every screen (patient
// Today, History, the caregiver view) so they can never disagree.
// ---------------------------------------------------------------------------

/** The training phase for `date`, including the logged-consistency gate. */
export function phaseFor(state: AppState, date: ISODate): PhaseId {
  return determinePhase(state.profile, date, state.log).phase
}

/**
 * Loaded patterns emphasized the day before `date` — drives cross-day rotation
 * in the built-in engine. Gated to Phase 3+. Reads yesterday's cached AI plan
 * if present, else regenerates it WITHOUT recent patterns (no recursion).
 */
export function recentPatternsFor(state: AppState, date: ISODate): Pattern[] {
  if (phaseFor(state, date) < 3 || state.profile.phaseOverride != null) return []
  const prev = addDays(date, -1)
  if (state.log[prev]?.status === 'rest' || state.overrides[prev] === 'rest') return []
  const cached = state.aiCache[prev]
  const prevPhase = phaseFor(state, prev)
  const yesterday = cached && cached.phase === prevPhase ? cached : generateWorkout(prev, prevPhase, state.profile, state.equipment)
  return loadedPatternsOf(yesterday)
}

/** Most steps the built-in engine will move off its default load, either way. */
const MAX_LOAD_OFFSET = 2

/**
 * How far to shift the built-in engine's default loads for `date`, from the
 * "how were the weights?" answers logged BEFORE that day: each "too light"
 * steps up, each "too heavy" steps down, bounded so it stays responsive (one
 * "too heavy" always brings a raised load back down). Using only earlier days
 * keeps a day's plan stable once it's been seen.
 */
export function loadOffsetFor(state: AppState, date: ISODate): number {
  let offset = 0
  for (const d of Object.keys(state.log).sort()) {
    if (d >= date) break
    const e = state.log[d]
    if (e.status !== 'completed' || !e.loadFeel) continue
    if (e.loadFeel === 'light') offset = Math.min(MAX_LOAD_OFFSET, offset + 1)
    else if (e.loadFeel === 'heavy') offset = Math.max(-MAX_LOAD_OFFSET, offset - 1)
  }
  return offset
}

/** The built-in engine's plan for `date`, honoring "easier"/"rest" overrides. */
export function deterministicFor(state: AppState, date: ISODate): Workout {
  const ov = state.overrides[date]
  const force = ov === 'rest' ? 'rest' : ov === 'easier' ? 'recovery_mobility' : undefined
  return generateWorkout(
    date,
    phaseFor(state, date),
    state.profile,
    state.equipment,
    force,
    force ? [] : recentPatternsFor(state, date),
    loadOffsetFor(state, date),
  )
}

/**
 * Is a cached AI plan still valid for `date` under the CURRENT rules? It must
 * match the day's phase, and every movement must still be eligible — so
 * removing equipment, re-instating sternal precautions, or the phase stepping
 * down after a layoff all invalidate plans made for the old situation.
 */
export function cachedPlanUsable(w: Workout | undefined, date: ISODate, state: AppState): w is Workout {
  if (!w) return false
  const phase = phaseFor(state, date)
  if (w.phase !== phase) return false
  const eligible = new Set(getEligibleMovements(phase, state.profile, state.equipment).map((m) => m.id))
  return w.blocks.every((b) => b.items.every((it) => eligible.has(it.movementId)))
}

/**
 * The plan the patient sees (or saw) for `date`. Past days show whatever AI
 * plan was cached — that's history, even if equipment has changed since.
 * Today and future days use the AI plan only if it's still valid now.
 */
export function planFor(state: AppState, date: ISODate, today: ISODate): { workout: Workout; isAi: boolean } {
  const deterministic = deterministicFor(state, date)
  const cached = state.aiCache[date]
  if (date < today) return cached ? { workout: cached, isAi: true } : { workout: deterministic, isAi: false }
  const aiEligible = state.profile.aiEnabled && !state.overrides[date] && !deterministic.isRecovery
  if (aiEligible && cachedPlanUsable(cached, date, state)) return { workout: cached, isAi: true }
  return { workout: deterministic, isAi: false }
}
