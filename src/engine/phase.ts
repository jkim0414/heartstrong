import type { PhaseId, Profile, ISODate } from '../types'
import { weeksSince, todayISO } from '../lib/date'

/** Weeks of Phase-2 rebuilding required after sternal precautions lift before Phase 3+. */
export const P2_DWELL_WEEKS = 3

export interface PhaseResult {
  phase: PhaseId
  /** Whether the phase is from an explicit manual override. */
  overridden: boolean
  /** Weeks since surgery, or null if unknown. */
  weeksPostOp: number | null
  /** Human-readable reason for the current phase. */
  reason: string
  /** A prompt nudging the user toward the next safe step, if any. */
  nudge: string | null
}

// ---------------------------------------------------------------------------
// Phase determination.
//
// Guardrails (intentionally conservative for a ~1-month-post-CABG patient):
//  - Not cleared to exercise  -> Phase 1, no matter what.
//  - Sternal precautions still on -> capped at Phase 1 (no arm/chest loading).
//  - After clearance + sternal lift: ramp 2 -> 3 -> 4 by time under training.
// A manual override is honored but flagged (with a warning shown in the UI).
// ---------------------------------------------------------------------------
export function determinePhase(profile: Profile, today: ISODate = todayISO()): PhaseResult {
  const weeksPostOp = profile.surgeryDate ? weeksSince(profile.surgeryDate, today) : null

  if (profile.phaseOverride != null) {
    return {
      phase: profile.phaseOverride,
      overridden: true,
      weeksPostOp,
      reason: 'Phase set manually in Settings.',
      nudge: null,
    }
  }

  if (!profile.clearedForExercise) {
    return {
      phase: 1,
      overridden: false,
      weeksPostOp,
      reason: 'Waiting on your cardiologist’s clearance to exercise.',
      nudge:
        'The best next step is getting formal clearance and, ideally, a referral to a supervised cardiac rehab program — it’s proven to help recovery and survival after bypass surgery.',
    }
  }

  if (!profile.sternalPrecautionsLifted) {
    return {
      phase: 1,
      overridden: false,
      weeksPostOp,
      reason:
        'Cleared to move, but sternal (breastbone) precautions are still in effect, so we keep load off the arms and chest.',
      nudge:
        'Sternal precautions are usually lifted around 6–8 weeks post-op once your surgeon confirms the breastbone has healed. When they do, mark it in Settings to unlock light strength training.',
    }
  }

  // Cleared + sternum healed: progress by time under training (from the later
  // of surgery date or a sensible baseline) using weeks post-op as a proxy.
  //
  // Ramp-in rail: whatever the calendar says, Phase 3+ must be EARNED with a
  // few weeks of Phase-2 rebuilding after precautions lift. Someone cleared
  // late (e.g. week 13) detrained through the whole early window — jumping
  // straight to Phase-3 intensity skips the graded reloading that cardiac-
  // rehab progression is built on. Legacy profiles without the date recorded
  // are treated as having served the dwell.
  const w = weeksPostOp ?? 8
  const weeksSinceLift = profile.sternalPrecautionsLiftedOn ? weeksSince(profile.sternalPrecautionsLiftedOn, today) : null
  const dwellRemaining = weeksSinceLift == null ? 0 : Math.max(0, P2_DWELL_WEEKS - weeksSinceLift)
  let phase: PhaseId
  let reason: string
  let nudge: string | null

  if (w < 10 || dwellRemaining > 0) {
    phase = 2
    reason =
      w < 10
        ? 'Sternum healed and cleared — building back with light resistance and steady intervals.'
        : 'Sternum healed and cleared — rebuilding with light resistance and steady intervals after the layoff, before the program steps up.'
    nudge =
      w < 10
        ? 'Once you’ve strung together a few consistent weeks here, the plan will progress to heavier, more varied work.'
        : `About ${dwellRemaining} more week${dwellRemaining === 1 ? '' : 's'} of rebuilding here, then the program steps up to heavier, more varied work.`
  } else if (w < 18) {
    phase = 3
    reason = 'Past the early window and training consistently — time to progress strength and conditioning.'
    nudge = null
  } else {
    phase = 4
    reason = 'Well into a durable training base — varied, progressive scaled conditioning.'
    nudge = null
  }

  return { phase, overridden: false, weeksPostOp, reason, nudge }
}
