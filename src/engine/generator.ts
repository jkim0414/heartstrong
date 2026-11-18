import type {
  EquipmentItem,
  Movement,
  Pattern,
  PhaseId,
  PrescribedItem,
  Profile,
  Workout,
  WorkoutBlock,
  ISODate,
} from '../types'
import { MOVEMENTS, MOVEMENTS_BY_ID } from '../data/movements'
import { normalizeWorkout } from './normalize'
import { PHASES, WEEKLY_SCHEDULE, type Archetype } from '../data/phases'
import { hashStr, mulberry32, weekday, weeksSince } from '../lib/date'

// ---------------------------------------------------------------------------
// The workout generator.
//
// Given a date, phase, profile and equipment, it deterministically produces a
// full session (warmup + workout + cooldown). "Deterministic" means the same
// day always yields the same workout (so it's stable once viewed), but days
// differ from one another via a date-seeded RNG.
//
// Safety is enforced here, not just upstream: a movement that loads the chest
// is NEVER selected unless the surgeon has lifted sternal precautions, even if
// the phase was manually overridden.
// ---------------------------------------------------------------------------

interface Ctx {
  rng: () => number
  phase: PhaseId
  profile: Profile
  /** Owned loadable equipment id -> available weights (lb). */
  loads: Record<string, number[]>
  weeksPostOp: number
  eligible: Movement[]
  /** Loaded patterns emphasized recently (prior day) — steer away from these. */
  recentPatterns: Set<Pattern>
  /** Steps above/below the phase's default load, earned from "too light/heavy" feedback. */
  loadOffset: number
}

/** Patterns whose back-to-back repetition is worth avoiding (Phase 3+). */
export const LOADED_PATTERNS: Pattern[] = ['squat', 'hinge', 'push', 'pull', 'lunge', 'carry']

/** The loaded movement patterns used in a workout's strength/conditioning blocks. */
export function loadedPatternsOf(workout: Workout): Pattern[] {
  const out = new Set<Pattern>()
  for (const b of workout.blocks) {
    if (b.block !== 'strength' && b.block !== 'metcon') continue
    for (const it of b.items) {
      const m = MOVEMENTS_BY_ID[it.movementId]
      if (m && LOADED_PATTERNS.includes(m.pattern)) out.add(m.pattern)
    }
  }
  return [...out]
}

export function ownedSet(equipment: EquipmentItem[]): Set<string> {
  const s = new Set<string>(['bodyweight'])
  for (const e of equipment) if (e.owned) s.add(e.id)
  return s
}

export function isEligible(m: Movement, phase: PhaseId, owned: Set<string>, sternalOk: boolean): boolean {
  if (m.minPhase > phase) return false
  if (m.sternalLoad && !sternalOk) return false
  // AND semantics: every required piece of equipment must be owned.
  return m.requires.every((r) => owned.has(r))
}

/**
 * The single source of truth for "what movements may this person do right now."
 * Used by both the offline generator and the validator for AI-generated plans.
 */
export function getEligibleMovements(phase: PhaseId, profile: Profile, equipment: EquipmentItem[]): Movement[] {
  const owned = ownedSet(equipment)
  return MOVEMENTS.filter((m) => isEligible(m, phase, owned, profile.sternalPrecautionsLifted))
}

/** Dumbbell pairs (lb) the user owns, sorted ascending. */
export function ownedDumbbellLoads(equipment: EquipmentItem[]): number[] {
  const d = equipment.find((e) => e.id === 'dumbbells' && e.owned)
  return [...(d?.weightsLb ?? [])].sort((a, b) => a - b)
}

/** Map of owned loadable-equipment id -> sorted available weights (lb). */
export function loadableLoads(equipment: EquipmentItem[]): Record<string, number[]> {
  const out: Record<string, number[]> = {}
  for (const e of equipment) {
    if (e.owned && e.weightsLb && e.weightsLb.length) out[e.id] = [...e.weightsLb].sort((a, b) => a - b)
  }
  return out
}

function sample<T>(pool: T[], rng: () => number): T {
  return pool[Math.floor(rng() * pool.length)]
}

/** Pick `n` distinct movements matching `pattern` from eligible. */
function pickPattern(ctx: Ctx, pattern: Pattern, used: Set<string>): Movement | null {
  const pool = ctx.eligible.filter((m) => m.pattern === pattern && !used.has(m.id))
  if (pool.length === 0) return null
  const m = sample(pool, ctx.rng)
  used.add(m.id)
  return m
}

function pickTag(ctx: Ctx, tag: string, used: Set<string>): Movement | null {
  const pool = ctx.eligible.filter((m) => m.tags?.includes(tag) && !used.has(m.id))
  if (pool.length === 0) return null
  const m = sample(pool, ctx.rng)
  used.add(m.id)
  return m
}

/** Explosive / momentum-driven lifts — kept lighter than slow lifts of the same pattern. */
const BALLISTIC = new Set(['db_swing', 'kb_swing', 'db_thruster', 'wall_ball'])

/**
 * Load policy shared by the built-in engine AND the AI validator. A load is a
 * POSITION within the weights the person owns — never "the heaviest by
 * default" (owning 40 lb dumbbells must not mean being handed them).
 *   base — the default suggestion for this phase and movement type
 *   cap  — the most that feedback ("too light") or the AI may progress to
 * Upper-body and ballistic lifts sit lower in the range than slow lower-body
 * lifts. With only one or two weights owned, both collapse to what's there.
 */
export function loadIndexRange(phase: PhaseId, m: Movement, count: number): { base: number; cap: number } {
  return loadRange(phase, m.pattern === 'push' || m.pattern === 'pull' || BALLISTIC.has(m.id), count)
}

/** The policy itself: `light` = upper-body or ballistic lift. See loadIndexRange. */
export function loadRange(phase: PhaseId, light: boolean, count: number): { base: number; cap: number } {
  const last = Math.max(0, count - 1)
  const frac = phase <= 2 ? 0 : phase === 3 ? (light ? 0 : 0.34) : light ? 0.25 : 0.5
  const base = Math.floor(last * frac)
  const headroom = phase <= 2 && light ? 1 : 2
  return { base, cap: Math.min(last, base + headroom) }
}

/** Suggested load for a movement, given the user's loadable equipment. */
function chooseLoad(ctx: Ctx, m: Movement): number | undefined {
  // Use the first required equipment that the user owns weights for.
  for (const req of m.requires) {
    const w = ctx.loads[req]
    if (w && w.length) {
      const { base, cap } = loadIndexRange(ctx.phase, m, w.length)
      return w[Math.max(0, Math.min(cap, base + ctx.loadOffset))]
    }
  }
  return undefined
}

function toItem(ctx: Ctx, m: Movement, dose: string): PrescribedItem {
  return {
    movementId: m.id,
    name: m.name,
    cue: m.cue,
    scaleDown: m.scaleDown,
    dose,
    loadLb: chooseLoad(ctx, m),
  }
}

// ---- Dose helpers ---------------------------------------------------------

/** Timed holds — dosed in seconds, never reps. */
const HOLDS = new Set(['wall_sit', 'plank_bench'])

/** A strength dose that fits the movement: holds in seconds, carries in distance, the rest in reps. */
function strengthDose(ctx: Ctx, m: Movement): string {
  const sets = ctx.phase <= 2 ? 2 : 3
  if (HOLDS.has(m.id)) return `${sets} sets × ${ctx.phase <= 2 ? '15–20' : '20–30'} sec hold`
  if (m.pattern === 'carry') return m.id === 'farmer_carry' ? `${sets} sets × 30 m` : `${sets} sets × 20 m each side`
  if (ctx.phase <= 2) return '2 sets × 10 (leave plenty in the tank)'
  return ctx.phase === 3 ? '3 sets × 10' : '3 sets × 12'
}

/**
 * Walk length in minutes. Sessions stay lean (~20–40 min all-in): consistency
 * beats volume, and daily walking on top is encouraged separately. Progresses
 * gently over the first weeks post-op, then holds.
 *   recovery — the easy walk on an active-recovery day
 *   easy     — a walk paired with leg work
 *   main     — the day's main aerobic piece
 */
function walkMinutes(ctx: Ctx, kind: 'recovery' | 'easy' | 'main'): number {
  const variety = Math.floor(ctx.rng() * 3) // 0–2
  const weeks = Math.max(0, ctx.weeksPostOp)
  if (kind === 'recovery') return 12 + Math.min(weeks, 4) + variety // 12–18
  if (kind === 'easy') return 10 + Math.min(weeks, 4) + variety // 10–16
  return 14 + Math.min(weeks, 6) + variety // 14–22
}

// ---- Block builders -------------------------------------------------------

function buildWarmup(ctx: Ctx): WorkoutBlock {
  // Keep it to the essentials: one breathing reset, one mobility drill, one
  // gentle pulse-raiser. A long warm-up adds friction without adding benefit.
  const used = new Set<string>()
  const items: PrescribedItem[] = []
  // Always include a breathing reset.
  const breath = ctx.eligible.find((m) => m.id === 'diaphragmatic_breathing')
  if (breath) {
    used.add(breath.id)
    items.push(toItem(ctx, breath, '5 slow breaths'))
  }
  // One mobility / gentle loosening drill.
  const mobility = pickTag(ctx, 'warmup', used)
  if (mobility) {
    const dose = mobility.pattern === 'locomotion' ? '1–2 min' : mobility.pattern === 'hinge' ? '8–10 slow reps' : '8–10 each side'
    items.push(toItem(ctx, mobility, dose))
  }
  // Gentle pulse-raiser to finish.
  const march = ctx.eligible.find((m) => m.id === 'marching_in_place' && !used.has(m.id))
  if (march) {
    used.add(march.id)
    items.push(toItem(ctx, march, '2 min, building gently'))
  }
  return {
    block: 'warmup',
    title: 'Warm-up',
    items,
    note: 'Ease in. The goal is to feel warmer and looser, never out of breath.',
  }
}

/** A walking movement if space is available, else marching in place. */
function locomotion(ctx: Ctx): Movement {
  return (
    ctx.eligible.find((m) => m.id === 'walk') ??
    ctx.eligible.find((m) => m.id === 'marching_in_place') ??
    ctx.eligible.find((m) => m.pattern === 'locomotion')!
  )
}

function buildCooldown(ctx: Ctx): WorkoutBlock {
  const used = new Set<string>()
  const items: PrescribedItem[] = []
  const walk = ctx.eligible.find((m) => m.id === 'walk') ?? ctx.eligible.find((m) => m.id === 'marching_in_place')
  if (walk) items.push(toItem(ctx, walk, '3–5 min, slowing down'))
  // One stretch, then a breathing reset — short and purposeful.
  const stretch = pickTag(ctx, 'cooldown', used)
  if (stretch) items.push(toItem(ctx, stretch, '30–45 sec each side'))
  const breath = ctx.eligible.find((m) => m.id === 'diaphragmatic_breathing')
  if (breath) items.push(toItem(ctx, breath, '6 slow breaths'))
  return {
    block: 'cooldown',
    title: 'Cool-down',
    items,
    note: 'Keep moving gently until your breathing is back to normal, then rise slowly — stopping suddenly can make you lightheaded, especially on heart or blood-pressure medication.',
  }
}

/**
 * Pick a movement for a strength slot, preferring genuine (loaded / progression)
 * movements tagged 'strength' over the gentle regressions, so higher phases
 * actually challenge. Falls back to any eligible movement of the pattern.
 */
function pickStrengthPattern(ctx: Ctx, pattern: Pattern, used: Set<string>): Movement | null {
  const strong = ctx.eligible.filter((m) => m.pattern === pattern && m.tags?.includes('strength') && !used.has(m.id))
  // From Phase 3, favor real progressions over the Phase-1 regressions (a
  // glute bridge is fine, but it shouldn't crowd out the deadlift).
  const progressed = ctx.phase >= 3 ? strong.filter((m) => m.minPhase >= 2) : []
  const pool = progressed.length > 0 ? progressed : strong
  if (pool.length > 0) {
    const m = sample(pool, ctx.rng)
    used.add(m.id)
    return m
  }
  return pickPattern(ctx, pattern, used)
}

function buildStrength(ctx: Ctx, count: number): WorkoutBlock | null {
  const used = new Set<string>()
  const items: PrescribedItem[] = []
  // Pattern priority: legs first (always safe & high value), then upper, then accessory.
  const base: Pattern[] = ['squat', 'hinge', 'push', 'pull', 'lunge', 'core', 'carry']
  // Recovery-aware rotation (Phase 3+): push patterns that were emphasized
  // yesterday to the back so today leads with fresh, non-overlapping ones.
  const order: Pattern[] = [
    ...base.filter((p) => !ctx.recentPatterns.has(p)),
    ...base.filter((p) => ctx.recentPatterns.has(p)),
  ]
  for (const p of order) {
    if (items.length >= count) break
    const m = pickStrengthPattern(ctx, p, used)
    if (m) items.push(toItem(ctx, m, strengthDose(ctx, m)))
  }
  if (items.length === 0) return null
  return {
    block: 'strength',
    title: 'Strength',
    format: 'Rest 60–90 sec between sets — full recovery, smooth reps',
    items,
    note:
      ctx.phase === 2
        ? 'Light and controlled. We’re re-teaching the movements and waking the muscles up, not chasing fatigue.'
        : 'Pick a weight you could do 2–3 more reps with. Stop a set if form slips or you feel any chest symptom.',
  }
}

/**
 * A conditioning dose that fits both the movement and the format. In an EMOM
 * each movement has to finish inside its minute with rest to spare, so
 * distances become short timed efforts.
 */
function metconDose(ctx: Ctx, m: Movement, emom: boolean): string {
  if (HOLDS.has(m.id)) return emom ? '20 sec hold' : '30 sec hold'
  if (m.pattern === 'carry') {
    if (m.id === 'farmer_carry') return emom ? '20 m' : '40 m'
    return emom ? '20 m (switch sides halfway)' : '40 m (switch sides halfway)'
  }
  if (m.pattern === 'locomotion') return emom ? '40 sec, steady' : '200 m or 1 min'
  return ctx.phase >= 3 ? '10 reps' : '8 reps'
}

function buildMetcon(ctx: Ctx, maxItems?: number): WorkoutBlock | null {
  const used = new Set<string>()
  const items: PrescribedItem[] = []

  // Choose 2–3 movements that flow: prefer metcon-tagged + legs + locomotion.
  const all = ctx.eligible.filter(
    (m) =>
      !m.tags?.includes('warmup') && // keep warm-up/mobility drills out of the workout
      (m.tags?.includes('metcon') ||
        m.pattern === 'locomotion' ||
        m.pattern === 'squat' ||
        m.pattern === 'lunge' ||
        m.pattern === 'hinge' ||
        m.pattern === 'carry') &&
      m.impact <= (ctx.phase >= 3 ? 2 : 1),
  )
  // From Phase 3, build conditioning from real progressions; the Phase-1
  // regressions (sit-to-stands, seated knee extensions…) only fill gaps.
  const progressed = ctx.phase >= 3 ? all.filter((m) => m.minPhase >= 2) : []
  const candidates = progressed.length >= 3 ? progressed : all
  const want = maxItems ?? (ctx.phase >= 3 ? 3 : 2)
  const usedPatterns = new Set<Pattern>()
  const picked: Movement[] = []
  for (let i = 0; i < want && candidates.length > 0; i++) {
    // Prefer movements whose pattern is fresh today AND wasn't emphasized
    // yesterday (Phase 3+ recovery-aware rotation); relax in tiers if needed.
    let pool = candidates.filter(
      (m) => !used.has(m.id) && !usedPatterns.has(m.pattern) && !ctx.recentPatterns.has(m.pattern),
    )
    if (pool.length === 0) pool = candidates.filter((m) => !used.has(m.id) && !usedPatterns.has(m.pattern))
    if (pool.length === 0) pool = candidates.filter((m) => !used.has(m.id))
    if (pool.length === 0) break
    const m = sample(pool, ctx.rng)
    used.add(m.id)
    usedPatterns.add(m.pattern)
    picked.push(m)
  }
  if (picked.length === 0) return null

  let format: string
  if (ctx.phase === 2) {
    format = '3 rounds, steady — rest as much as you need between rounds'
  } else if (ctx.phase === 3) {
    format = sample(['AMRAP 9 min (as many rounds as possible, smooth pace)', '4 rounds for quality', '5 rounds, steady'], ctx.rng)
  } else {
    format = sample(
      ['AMRAP 12 min (smooth, sustainable pace)', 'EMOM 12 min (one movement per minute, rotate)', '5 rounds for time — but stay in control'],
      ctx.rng,
    )
  }

  const emom = format.startsWith('EMOM')
  for (const m of picked) {
    items.push(toItem(ctx, m, metconDose(ctx, m, emom)))
  }

  return {
    block: 'metcon',
    title: 'Conditioning',
    format,
    items,
    note:
      'This is the part that builds your engine. Find a pace you can sustain and keep breathing — never hold your breath or sprint to exhaustion.',
  }
}

function buildAerobicIntervals(ctx: Ctx): WorkoutBlock {
  const used = new Set<string>()
  // Hard interval movement (faster locomotion).
  const hard =
    pickTag(ctx, 'interval', used) ??
    ctx.eligible.find((m) => m.id === 'brisk_walk') ??
    ctx.eligible.find((m) => m.id === 'march_high')!
  const rounds = ctx.phase === 2 ? 6 : ctx.phase === 3 ? 8 : 10
  const onMin = ctx.phase === 2 ? 2 : 1
  const offMin = ctx.phase === 2 ? 1 : 1
  return {
    block: 'metcon',
    title: 'Aerobic intervals',
    format: `${rounds} rounds: ${onMin} min ${hard.name.toLowerCase()} (working) / ${offMin} min ${
      hard.requires.includes('rower') ? 'very easy rowing' : 'easy walk'
    } (recover)`,
    items: [toItem(ctx, hard, `${onMin} min, at your target effort`)],
    note: 'On the "working" minutes, lift the effort to your target. On the "easy" minutes, truly recover — slow right down.',
  }
}

function buildEasyWalk(ctx: Ctx, kind: 'recovery' | 'easy' | 'main'): WorkoutBlock {
  const walk = locomotion(ctx)
  const mins = walkMinutes(ctx, kind)
  return {
    block: 'metcon',
    title: 'Walk',
    items: [toItem(ctx, walk, `${mins} min, conversational pace`)],
    note: 'Steady and easy the whole way — you should be able to chat. Walking daily is the single best thing you can do right now.',
  }
}

function buildWalkIntervals(ctx: Ctx): WorkoutBlock {
  const walk = locomotion(ctx)
  // Target ~12–18 min of intervals (3 min each) so the whole Phase-1 session
  // stays in the sustainable ~25–30 min band. It still progresses with weeks
  // post-op, then caps — daily walking on top is encouraged separately, since
  // consistency matters more than piling minutes into one session.
  const targetMin = 12 + Math.min(ctx.weeksPostOp, 6)
  const rounds = Math.max(4, Math.round(targetMin / 3))
  return {
    block: 'metcon',
    title: 'Walk intervals',
    format: `${rounds} rounds: 2 min comfortable walk / 1 min slower walk`,
    items: [toItem(ctx, walk, 'Alternate the pace by feel')],
    note: 'Even the "comfortable" pace stays easy in Phase 1 — you’re just adding a little rhythm. Keep it conversational.',
  }
}

function buildLightLegs(ctx: Ctx): WorkoutBlock | null {
  // Rotate through the safe lower-body / core pool, one movement per pattern,
  // so the daily leg work varies instead of repeating the same two moves.
  const pool = ctx.eligible.filter(
    (m) =>
      !m.tags?.includes('warmup') &&
      (m.pattern === 'squat' || m.pattern === 'hinge' || m.pattern === 'core') &&
      m.impact <= 1,
  )
  const used = new Set<string>()
  const usedPatterns = new Set<Pattern>()
  const items: PrescribedItem[] = []
  for (let i = 0; i < 3; i++) {
    let cands = pool.filter((m) => !used.has(m.id) && !usedPatterns.has(m.pattern))
    if (cands.length === 0) cands = pool.filter((m) => !used.has(m.id))
    if (cands.length === 0) break
    const m = sample(cands, ctx.rng)
    used.add(m.id)
    usedPatterns.add(m.pattern)
    items.push(toItem(ctx, m, HOLDS.has(m.id) ? '2 sets × 15–20 sec hold' : '1–2 sets × 8–10, slow and controlled'))
  }
  if (items.length === 0) return null
  return {
    block: 'strength',
    title: 'Gentle legs',
    format: 'Take your time — rest whenever you like',
    items,
    note: 'Remember: stand using your legs, never push up with your hands while your breastbone heals.',
  }
}

// ---- Top-level assembly ---------------------------------------------------

const REST_QUOTES = [
  'Rest is part of the program — it’s when your heart and muscles actually adapt.',
  'A true day off. A gentle stroll and some easy breathing are perfect if you feel like moving.',
  'Recovery day. Hydrate, move easy if you want, and come back fresh tomorrow.',
]

export function generateWorkout(
  date: ISODate,
  phase: PhaseId,
  profile: Profile,
  equipment: EquipmentItem[],
  forceArchetype?: Archetype,
  recentPatterns: Pattern[] = [],
  /** Steps above/below the default load, from logged "too light/heavy" feedback. */
  loadOffset = 0,
): Workout {
  const owned = ownedSet(equipment)
  const sternalOk = profile.sternalPrecautionsLifted
  const eligible = MOVEMENTS.filter((m) => isEligible(m, phase, owned, sternalOk))
  const ctx: Ctx = {
    rng: mulberry32(hashStr(`${date}|p${phase}`)),
    phase,
    profile,
    loads: loadableLoads(equipment),
    weeksPostOp: profile.surgeryDate ? weeksSince(profile.surgeryDate, date) : 8,
    eligible,
    // Only steer away from recent patterns once there's real load to manage.
    recentPatterns: new Set(phase >= 3 ? recentPatterns : []),
    loadOffset,
  }

  const def = PHASES[phase]
  const archetype: Archetype = forceArchetype ?? WEEKLY_SCHEDULE[phase][weekday(date)]

  const blocks: WorkoutBlock[] = []
  let title = ''
  let summary = ''
  let isRecovery = false
  let rpeLow = def.rpeLow
  let rpeHigh = def.rpeHigh

  const add = (b: WorkoutBlock | null) => {
    if (b && b.items.length > 0) blocks.push(b)
  }

  switch (archetype) {
    case 'rest':
      return {
        date,
        phase,
        title: 'Rest day',
        summary: sample(REST_QUOTES, ctx.rng),
        estMinutes: 0,
        rpeLow: 0,
        rpeHigh: 1,
        talkTest: 'Take it easy today.',
        blocks: [],
        isRecovery: true,
      }

    case 'recovery_mobility':
      isRecovery = true
      title = 'Active recovery'
      summary = 'Loosen up, breathe, and take an easy walk. Nothing taxing — just keep the body moving.'
      rpeLow = 1
      rpeHigh = 3
      add(buildWarmup(ctx))
      add(buildEasyWalk(ctx, 'recovery'))
      add(buildCooldown(ctx))
      break

    case 'walk_easy':
      title = 'Easy walk'
      summary = 'A steady, conversational walk with a gentle warm-up and cool-down.'
      add(buildWarmup(ctx))
      add(buildEasyWalk(ctx, 'main'))
      add(buildCooldown(ctx))
      break

    case 'walk_intervals':
      title = 'Walk + rhythm'
      summary = 'A walk with a little pace variation to gently nudge your conditioning.'
      add(buildWarmup(ctx))
      add(buildWalkIntervals(ctx))
      add(buildCooldown(ctx))
      break

    case 'walk_legs':
      title = 'Walk + gentle legs'
      summary = 'An easy walk plus light, no-hands leg work to rebuild lower-body strength.'
      add(buildWarmup(ctx))
      add(buildEasyWalk(ctx, 'easy'))
      add(buildLightLegs(ctx))
      add(buildCooldown(ctx))
      break

    case 'aerobic_intervals':
      title = 'Aerobic intervals'
      summary = 'Repeated easy-to-moderate efforts to build your engine, with full recovery between.'
      add(buildWarmup(ctx))
      add(buildAerobicIntervals(ctx))
      add(buildCooldown(ctx))
      break

    case 'strength_full':
      title = 'Full-body strength'
      summary = 'The day’s focus is resistance training — controlled, full-body, building real strength.'
      add(buildWarmup(ctx))
      add(buildStrength(ctx, ctx.phase >= 4 ? 4 : 3))
      add(buildCooldown(ctx))
      break

    case 'strength_metcon':
      title = 'Strength + conditioning'
      summary = 'A short strength block, then a conditioning piece — the heart of scaled CrossFit.'
      add(buildWarmup(ctx))
      add(buildStrength(ctx, ctx.phase >= 3 ? 3 : 2))
      // Paired with strength, the conditioning piece stays to 2 movements so
      // the combined day doesn't balloon into a long session.
      add(buildMetcon(ctx, 2))
      add(buildCooldown(ctx))
      break

    case 'metcon_mixed':
      title = 'Mixed conditioning'
      summary = 'A varied conditioning workout to build stamina and keep things interesting.'
      add(buildWarmup(ctx))
      add(buildMetcon(ctx))
      add(buildCooldown(ctx))
      break

    case 'strength_long_aerobic':
      title = 'Strength + longer aerobic'
      summary = 'A short strength block, then a longer, steady aerobic effort.'
      add(buildWarmup(ctx))
      add(buildStrength(ctx, 2))
      add(buildEasyWalk(ctx, 'main'))
      add(buildCooldown(ctx))
      break
  }

  // If equipment/phase left a workout thin (e.g. nothing for strength), it
  // still has warmup + cooldown; ensure there's always something aerobic.
  if (!isRecovery && blocks.filter((b) => b.block === 'metcon' || b.block === 'strength').length === 0) {
    add(buildEasyWalk(ctx, 'main'))
  }

  // Run the shared consistency pass (even alternating reps, honest time
  // estimate) so deterministic and AI workouts obey the same invariants.
  return normalizeWorkout({
    date,
    phase,
    title,
    summary,
    estMinutes: 0, // recomputed by normalizeWorkout
    rpeLow,
    rpeHigh,
    // An easy day gets the easy-day talk test, not the phase's hard-interval one.
    talkTest: isRecovery ? 'You should be able to hold a full conversation throughout.' : def.talkTest,
    blocks,
    isRecovery,
  })
}
