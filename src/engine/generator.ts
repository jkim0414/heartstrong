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
import { MOVEMENTS } from '../data/movements'
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

/** Suggested load for a movement, given the user's loadable equipment. */
function chooseLoad(ctx: Ctx, m: Movement): number | undefined {
  // Use the first required equipment that the user owns weights for.
  for (const req of m.requires) {
    const w = ctx.loads[req]
    if (w && w.length) {
      const light = w[0]
      const heavy = w[w.length - 1]
      // Easing in (phase 2) -> lightest. Upper-body / overhead -> lighter.
      if (ctx.phase <= 2) return light
      const upper = m.pattern === 'push' || m.pattern === 'pull'
      return upper ? light : heavy
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

function strengthDose(ctx: Ctx): string {
  if (ctx.phase <= 2) return '2 sets × 10 (leave plenty in the tank)'
  if (ctx.phase === 3) return '3 sets × 10'
  return '3 sets × 12'
}

function walkMinutes(ctx: Ctx, kind: 'easy' | 'main'): number {
  // Gentle progression with weeks post-op, with small day-to-day variety.
  const base = ctx.phase === 1 ? 10 : 18
  const ramp = Math.min(ctx.weeksPostOp, 16)
  const variety = Math.floor(ctx.rng() * 3) // 0–2
  const m = base + ramp + variety + (kind === 'main' ? 4 : 0)
  return Math.max(8, Math.min(m, 45))
}

// ---- Block builders -------------------------------------------------------

function buildWarmup(ctx: Ctx): WorkoutBlock {
  const used = new Set<string>()
  const items: PrescribedItem[] = []
  const breathing = pickTag(ctx, 'warmup', used) // mostly mobility/breathing
  if (breathing) items.push(toItem(ctx, breathing, '1 min, easy'))
  // Always include a breathing reset.
  const breath = ctx.eligible.find((m) => m.id === 'diaphragmatic_breathing')
  if (breath && !used.has(breath.id)) {
    used.add(breath.id)
    items.push(toItem(ctx, breath, '5 slow breaths'))
  }
  // A couple more mobility / gentle locomotion bits.
  for (let i = 0; i < 2; i++) {
    const m = pickTag(ctx, 'warmup', used)
    if (m) items.push(toItem(ctx, m, m.pattern === 'locomotion' ? '1–2 min' : '8–10 each side'))
  }
  // Gentle pulse-raiser.
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
  // Stretches.
  for (let i = 0; i < 2; i++) {
    const m = pickTag(ctx, 'cooldown', used)
    if (m) items.push(toItem(ctx, m, '30–45 sec each side'))
  }
  const breath = ctx.eligible.find((m) => m.id === 'diaphragmatic_breathing')
  if (breath) items.push(toItem(ctx, breath, '6 slow breaths'))
  return {
    block: 'cooldown',
    title: 'Cool-down',
    items,
    note: 'Keep moving gently until your breathing is back to normal, then rise slowly — this protects your blood pressure on these medications.',
  }
}

/**
 * Pick a movement for a strength slot, preferring genuine (loaded / progression)
 * movements tagged 'strength' over the gentle regressions, so higher phases
 * actually challenge. Falls back to any eligible movement of the pattern.
 */
function pickStrengthPattern(ctx: Ctx, pattern: Pattern, used: Set<string>): Movement | null {
  const strong = ctx.eligible.filter((m) => m.pattern === pattern && m.tags?.includes('strength') && !used.has(m.id))
  if (strong.length > 0) {
    const m = sample(strong, ctx.rng)
    used.add(m.id)
    return m
  }
  return pickPattern(ctx, pattern, used)
}

function buildStrength(ctx: Ctx, count: number): WorkoutBlock | null {
  const used = new Set<string>()
  const items: PrescribedItem[] = []
  // Pattern priority: legs first (always safe & high value), then upper, then accessory.
  const order: Pattern[] = ['squat', 'hinge', 'push', 'pull', 'lunge', 'core', 'carry']
  for (const p of order) {
    if (items.length >= count) break
    const m = pickStrengthPattern(ctx, p, used)
    if (m) items.push(toItem(ctx, m, strengthDose(ctx)))
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

function buildMetcon(ctx: Ctx): WorkoutBlock | null {
  const used = new Set<string>()
  const items: PrescribedItem[] = []

  // Choose 2–3 movements that flow: prefer metcon-tagged + legs + locomotion.
  const candidates = ctx.eligible.filter(
    (m) =>
      (m.tags?.includes('metcon') ||
        m.pattern === 'locomotion' ||
        m.pattern === 'squat' ||
        m.pattern === 'lunge' ||
        m.pattern === 'hinge') &&
      m.impact <= (ctx.phase >= 3 ? 2 : 1),
  )
  const want = ctx.phase >= 3 ? 3 : 2
  const usedPatterns = new Set<Pattern>()
  for (let i = 0; i < want && candidates.length > 0; i++) {
    // Prefer movements whose pattern hasn't been used yet (variety); relax if needed.
    let pool = candidates.filter((m) => !used.has(m.id) && !usedPatterns.has(m.pattern))
    if (pool.length === 0) pool = candidates.filter((m) => !used.has(m.id))
    if (pool.length === 0) break
    const m = sample(pool, ctx.rng)
    used.add(m.id)
    usedPatterns.add(m.pattern)
    const isLoco = m.pattern === 'locomotion'
    const isHold = m.id === 'wall_sit' || m.id === 'plank_bench'
    const reps = isHold ? '30 sec hold' : isLoco ? '200 m or 1 min' : ctx.phase >= 3 ? '10 reps' : '8 reps'
    items.push(toItem(ctx, m, reps))
  }
  if (items.length === 0) return null

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
    format: `${rounds} rounds: ${onMin} min ${hard.name.toLowerCase()} (working) / ${offMin} min easy walk (recover)`,
    items: [toItem(ctx, hard, `${onMin} min, at your target effort`)],
    note: 'On the "working" minutes, lift the effort to your target. On the "easy" minutes, truly recover — slow right down.',
  }
}

function buildEasyWalk(ctx: Ctx, kind: 'easy' | 'main'): WorkoutBlock {
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
  const rounds = 5 + Math.min(ctx.weeksPostOp, 4)
  return {
    block: 'metcon',
    title: 'Walk intervals',
    format: `${rounds} rounds: 2 min comfortable walk / 1 min slower walk`,
    items: [toItem(ctx, walk, 'Alternate the pace by feel')],
    note: 'Even the "comfortable" pace stays easy in Phase 1 — you’re just adding a little rhythm. Keep it conversational.',
  }
}

function buildLightLegs(ctx: Ctx): WorkoutBlock | null {
  const used = new Set<string>()
  const items: PrescribedItem[] = []
  const order: Pattern[] = ['squat', 'core']
  for (const p of order) {
    const m = pickPattern(ctx, p, used)
    if (m) items.push(toItem(ctx, m, '1–2 sets × 8–10, slow and controlled'))
  }
  // A standing knee-drive / march for a little more.
  const knee = ctx.eligible.find((m) => m.id === 'standing_marches_core' && !used.has(m.id))
  if (knee) {
    used.add(knee.id)
    items.push(toItem(ctx, knee, '2 sets × 10 each side'))
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
      add(buildEasyWalk(ctx, 'easy'))
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
      add(buildStrength(ctx, ctx.phase >= 3 ? 4 : 3))
      add(buildCooldown(ctx))
      break

    case 'strength_metcon':
      title = 'Strength + conditioning'
      summary = 'A short strength block, then a conditioning piece — the heart of scaled CrossFit.'
      add(buildWarmup(ctx))
      add(buildStrength(ctx, ctx.phase >= 3 ? 3 : 2))
      add(buildMetcon(ctx))
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

  const estMinutes = estimateMinutes(blocks, isRecovery)

  return {
    date,
    phase,
    title,
    summary,
    estMinutes,
    rpeLow,
    rpeHigh,
    talkTest: def.talkTest,
    blocks,
    isRecovery,
  }
}

function estimateMinutes(blocks: WorkoutBlock[], isRecovery: boolean): number {
  let mins = 0
  for (const b of blocks) {
    if (b.block === 'warmup') mins += 6
    else if (b.block === 'cooldown') mins += 6
    else if (b.block === 'strength') mins += b.items.length * 4
    else mins += 12 // metcon / walk
  }
  return isRecovery ? Math.max(mins, 15) : Math.max(mins, 20)
}
