import type { AppState, EquipmentItem, ISODate, Pattern, Profile, Workout } from '../types'
import { determinePhase } from './phase'
import { generateWorkout, getEligibleMovements, loadedPatternsOf } from './generator'
import { addDays } from '../lib/date'

// ---------------------------------------------------------------------------
// "Which plan applies to this day?" — one answer for every screen (patient
// Today, History, the caregiver view) so they can never disagree.
// ---------------------------------------------------------------------------

/**
 * Loaded patterns emphasized the day before `date` — drives cross-day rotation
 * in the built-in engine. Gated to Phase 3+. Reads yesterday's cached AI plan
 * if present, else regenerates it WITHOUT recent patterns (no recursion).
 */
export function recentPatternsFor(state: AppState, date: ISODate): Pattern[] {
  const pr = determinePhase(state.profile, date)
  if (pr.phase < 3 || state.profile.phaseOverride != null) return []
  const prev = addDays(date, -1)
  if (state.log[prev]?.status === 'rest' || state.overrides[prev] === 'rest') return []
  const cached = state.aiCache[prev]
  const prevPhase = determinePhase(state.profile, prev).phase
  const yesterday = cached && cached.phase === prevPhase ? cached : generateWorkout(prev, prevPhase, state.profile, state.equipment)
  return loadedPatternsOf(yesterday)
}

/** The built-in engine's plan for `date`, honoring "easier"/"rest" overrides. */
export function deterministicFor(state: AppState, date: ISODate): Workout {
  const pr = determinePhase(state.profile, date)
  const ov = state.overrides[date]
  const force = ov === 'rest' ? 'rest' : ov === 'easier' ? 'recovery_mobility' : undefined
  return generateWorkout(date, pr.phase, state.profile, state.equipment, force, force ? [] : recentPatternsFor(state, date))
}

/**
 * Is a cached AI plan still valid for `date` under the CURRENT rules? It must
 * match the day's phase, and every movement must still be eligible — so
 * removing equipment or re-instating sternal precautions invalidates plans
 * that were safety-checked against the old situation.
 */
export function cachedPlanUsable(w: Workout | undefined, date: ISODate, profile: Profile, equipment: EquipmentItem[]): w is Workout {
  if (!w) return false
  const phase = determinePhase(profile, date).phase
  if (w.phase !== phase) return false
  const eligible = new Set(getEligibleMovements(phase, profile, equipment).map((m) => m.id))
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
  if (aiEligible && cachedPlanUsable(cached, date, state.profile, state.equipment)) return { workout: cached, isAi: true }
  return { workout: deterministic, isAi: false }
}

