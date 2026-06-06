import type { EquipmentItem, ISODate, PhaseId, Profile, RawAiWorkout, Workout, WorkoutBlock } from '../types'
import { MOVEMENTS_BY_ID } from '../data/movements'
import { PHASES } from '../data/phases'
import { getEligibleMovements, loadableLoads } from './generator'
import { normalizeWorkout } from './normalize'

export interface ValidationResult {
  workout: Workout | null
  errors: string[]
}

/**
 * Re-validate an AI-generated workout against the SAME hard safety rails the
 * offline engine enforces. Nothing the model returns is trusted: movement IDs
 * must be in the eligible set (which already excludes sternal-loading and
 * out-of-phase movements), loads must be owned, effort must be within the
 * phase ceiling, and structure must include a warm-up and cool-down.
 *
 * Movement names, cues and scaling are pulled from OUR vetted library, not the
 * model — so coaching is always medically accurate. The model's creativity is
 * confined to structure, formats, selection, dosing, titles and themes.
 *
 * Returns the rebuilt Workout if everything checks out, else null (caller then
 * falls back to the deterministic generator).
 */
export function validateAiWorkout(
  raw: RawAiWorkout,
  date: ISODate,
  phase: PhaseId,
  profile: Profile,
  equipment: EquipmentItem[],
): ValidationResult {
  const errors: string[] = []
  const def = PHASES[phase]
  const eligible = new Set(getEligibleMovements(phase, profile, equipment).map((m) => m.id))
  const loadsByEquip = loadableLoads(equipment)

  if (!raw || !Array.isArray(raw.blocks) || raw.blocks.length === 0) {
    return { workout: null, errors: ['No blocks returned.'] }
  }

  const isRecovery = !!raw.isRecovery
  const blocks: WorkoutBlock[] = []

  for (const b of raw.blocks) {
    if (!['warmup', 'strength', 'metcon', 'cooldown'].includes(b.block)) {
      errors.push(`Unknown block type: ${b.block}`)
      continue
    }
    const items = (b.items ?? [])
      .map((it) => {
        const m = MOVEMENTS_BY_ID[it.movementId]
        if (!m) {
          errors.push(`Unknown movement: ${it.movementId}`)
          return null
        }
        if (!eligible.has(m.id)) {
          // This is the safety-critical check: sternal-load / out-of-phase /
          // unavailable-equipment movements are not in the eligible set.
          errors.push(`Ineligible movement for this phase/precautions: ${m.name}`)
          return null
        }
        // Clamp loads to a weight the user actually owns for this movement.
        let loadLb: number | undefined
        const reqWeights = m.requires.map((r) => loadsByEquip[r]).find((w) => w && w.length)
        if (reqWeights && typeof it.loadLb === 'number') {
          const target = it.loadLb
          loadLb = reqWeights.reduce((best, w) => (Math.abs(w - target) < Math.abs(best - target) ? w : best), reqWeights[0])
        }
        return {
          movementId: m.id,
          name: m.name, // from our library, not the model
          cue: m.cue, // from our library, not the model
          scaleDown: m.scaleDown,
          dose: String(it.dose ?? '').slice(0, 90) || '1 set',
          loadLb,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    if (items.length === 0 && !isRecovery) continue
    blocks.push({
      block: b.block,
      title: String(b.title ?? b.block).slice(0, 80),
      format: b.format ? String(b.format).slice(0, 240) : undefined,
      note: b.note ? String(b.note).slice(0, 600) : undefined,
      items,
    })
  }

  // Any ineligible/unknown movement invalidates the whole plan — fall back.
  if (errors.length > 0) return { workout: null, errors }

  // Structure: a real session must bookend with a warm-up and a cool-down.
  if (!isRecovery) {
    if (!blocks.some((b) => b.block === 'warmup')) errors.push('Missing warm-up.')
    if (!blocks.some((b) => b.block === 'cooldown')) errors.push('Missing cool-down.')
    if (!blocks.some((b) => b.block === 'strength' || b.block === 'metcon')) errors.push('No work blocks.')
  }
  if (errors.length > 0) return { workout: null, errors }

  // Effort ceiling is a hard cap — the model can never push above the phase max.
  const rpeHigh = Math.min(Number(raw.rpeHigh) || def.rpeHigh, def.rpeHigh)
  const rpeLow = Math.max(0, Math.min(Number(raw.rpeLow) || def.rpeLow, rpeHigh))
  const estMinutes = Math.max(5, Math.min(Number(raw.estMinutes) || 30, 75))

  const workout: Workout = {
    date,
    phase,
    title: String(raw.title ?? def.name).slice(0, 100),
    summary: String(raw.summary ?? def.tagline).slice(0, 400),
    estMinutes,
    rpeLow,
    rpeHigh,
    talkTest: def.talkTest, // always our vetted guidance
    blocks,
    isRecovery,
  }
  // Final consistency pass: even alternating reps + recompute the time estimate
  // from the actual prescription (the model's estMinutes is only a fallback).
  return { workout: normalizeWorkout(workout), errors: [] }
}
