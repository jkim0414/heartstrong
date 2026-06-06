import type { PrescribedItem, Workout, WorkoutBlock } from '../types'
import { MOVEMENTS_BY_ID } from '../data/movements'

/**
 * Post-generation consistency pass — the "hard guardrails" layer.
 *
 * Both the deterministic engine and (re-validated) AI workouts run through
 * this so logical/mathematical invariants always hold, regardless of where the
 * numbers came from. Each rule is small and independent; add new invariants as
 * named helpers and call them from normalizeWorkout.
 *
 * Current rules:
 *  1. Alternating movements must have an EVEN total rep count (so both sides
 *     get equal work).
 *  2. estMinutes must actually reflect the prescribed work (parsed from the
 *     doses + formats), not a hand-wavy constant.
 */
export function normalizeWorkout(workout: Workout): Workout {
  const blocks = workout.blocks.map((b) => ({
    ...b,
    items: b.items.map((it) => {
      const m = MOVEMENTS_BY_ID[it.movementId]
      if (m?.alternates) return { ...it, dose: evenizeReps(it.dose) }
      return it
    }),
  }))
  return { ...workout, blocks, estMinutes: estimateWorkoutMinutes(blocks, workout.isRecovery) }
}

const nextEven = (n: number) => (n % 2 === 0 ? n : n + 1)

/**
 * Round any bare total-rep count in a dose UP to the nearest even number.
 * Skips per-side doses ("10 each leg") — those are already balanced — and
 * time/distance doses (no rep count to touch).
 */
export function evenizeReps(dose: string): string {
  if (/each (side|leg|arm)|per side/i.test(dose)) return dose
  let out = dose
  // "sets × 10" / "sets x 10"
  out = out.replace(/(×|x)\s*(\d+)/gi, (_, sym: string, r: string) => `${sym} ${nextEven(Number(r))}`)
  // "10 reps"
  out = out.replace(/(\d+)(\s*reps?)/gi, (_, r: string, suffix: string) => `${nextEven(Number(r))}${suffix}`)
  return out
}

/** Parse a minutes value from a dose like "3–5 min", "22 min", "45 sec". */
function parseTimeMinutes(text: string): number | null {
  const range = text.match(/(\d+)\s*[–-]\s*(\d+)\s*min/i)
  if (range) return (Number(range[1]) + Number(range[2])) / 2
  const min = text.match(/(\d+)\s*min/i)
  if (min) return Number(min[1])
  const secRange = text.match(/(\d+)\s*[–-]\s*(\d+)\s*sec/i)
  if (secRange) return (Number(secRange[1]) + Number(secRange[2])) / 2 / 60
  const sec = text.match(/(\d+)\s*sec/i)
  if (sec) return Number(sec[1]) / 60
  return null
}

function blockMinutes(b: WorkoutBlock): number {
  if (b.block === 'warmup' || b.block === 'cooldown') {
    // Sum each drill's time; short drills (breaths, "8–10 each side") ≈ 1 min.
    return b.items.reduce((sum, it) => sum + (parseTimeMinutes(it.dose) ?? 1), 0)
  }

  if (b.block === 'strength') {
    // Per movement: sets × (work + ~75s rest). Default ~4 min if sets unknown.
    return b.items.reduce((sum, it) => {
      const sets = it.dose.match(/(\d+)\s*sets?/i)
      return sum + (sets ? Number(sets[1]) * 1.8 : 4)
    }, 0)
  }

  // metcon — the format string is the most reliable timing source.
  const f = b.format ?? ''
  // 1. Interval rounds with explicit on/off minutes: "9 rounds: 2 min … / 1 min …"
  const interval = f.match(/(\d+)\s*rounds?\s*:\s*(\d+)\s*min[\s\S]*?\/\s*(\d+)\s*min/i)
  if (interval) return Number(interval[1]) * (Number(interval[2]) + Number(interval[3]))
  // 2. Time-boxed: AMRAP / EMOM / "for N min".
  const timeBoxed = parseTimeMinutes(f)
  if (timeBoxed != null) return timeBoxed
  // 3. Plain "N rounds" (no per-round minutes): ~1 min per movement per round.
  const rounds = f.match(/(\d+)\s*rounds?/i)
  if (rounds) return Number(rounds[1]) * Math.max(1, b.items.length)
  // 4. Fallback: sum any per-item durations, else ~3 min per movement.
  return b.items.reduce((sum, it) => sum + (parseTimeMinutes(it.dose) ?? 3), 0)
}

/** Honest total-time estimate derived from the blocks' actual prescriptions. */
export function estimateWorkoutMinutes(blocks: WorkoutBlock[], isRecovery: boolean): number {
  if (blocks.length === 0) return 0 // e.g. a rest day — no prescribed work
  const raw = blocks.reduce((sum, b) => sum + blockMinutes(b), 0)
  const rounded = Math.round(raw)
  return Math.min(isRecovery ? Math.max(rounded, 12) : Math.max(rounded, 18), 90)
}

/** Exposed for tests: does this item satisfy the even-rep invariant? */
export function alternatingRepsAreEven(item: PrescribedItem): boolean {
  const m = MOVEMENTS_BY_ID[item.movementId]
  if (!m?.alternates) return true
  if (/each (side|leg|arm)|per side/i.test(item.dose)) return true
  // Every rep/× count present must be even.
  const counts = [...item.dose.matchAll(/(?:×|x)\s*(\d+)|(\d+)\s*reps?/gi)].map((mm) => Number(mm[1] ?? mm[2]))
  return counts.every((n) => n % 2 === 0)
}
