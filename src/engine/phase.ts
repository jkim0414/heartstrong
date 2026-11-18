import type { AppState, PhaseId, Profile, ISODate } from '../types'
import { addDays, weekday, weeksSince, todayISO } from '../lib/date'

/** Weeks of Phase-2 rebuilding required after sternal precautions lift before Phase 3+. */
export const P2_DWELL_WEEKS = 3

/**
 * Consistency gate: the higher phases require recent training, not just time
 * since surgery. Counted over the ACTIVITY_WINDOW_DAYS before the current
 * week began, so the phase holds steady within a week.
 */
export const ACTIVITY_WINDOW_DAYS = 21
/** Completed workouts in the window needed for Phase 3 (~1–2 a week). */
export const SESSIONS_FOR_PHASE_3 = 4
/** Completed workouts in the window needed for Phase 4 (~3 a week). */
export const SESSIONS_FOR_PHASE_4 = 9

/** Completed workouts in the activity window before the week containing `date`. */
export function recentSessions(log: AppState['log'], date: ISODate): number {
  const weekStart = addDays(date, -weekday(date))
  let n = 0
  for (let i = 1; i <= ACTIVITY_WINDOW_DAYS; i++) if (log[addDays(weekStart, -i)]?.status === 'completed') n++
  return n
}

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
//  - After clearance + sternal lift: ramp 2 -> 3 -> 4 by time since surgery,
//    but Phase 3+ must also be EARNED twice over: a few weeks of Phase-2
//    rebuilding after the sternum is cleared, and recent consistent training
//    (when a workout log is supplied). After a long layoff the calendar alone
//    would hand back Phase-4 intensity on day one; the log gate steps it down
//    and lets a few consistent weeks bring it back.
// A manual override is honored but flagged (with a warning shown in the UI).
// ---------------------------------------------------------------------------
export function determinePhase(profile: Profile, today: ISODate = todayISO(), log?: AppState['log']): PhaseResult {
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

  // Consistency gate (only when we can see the log).
  if (log && phase >= 3) {
    const sessions = recentSessions(log, today)
    if (sessions < SESSIONS_FOR_PHASE_3) {
      phase = 2
      reason = 'Easing back in — lighter strength work and steady efforts while you rebuild a rhythm.'
      nudge = `The program steps back up once you’ve logged about ${SESSIONS_FOR_PHASE_3} workouts within three weeks. It re-checks at the start of each week.`
    } else if (phase === 4 && sessions < SESSIONS_FOR_PHASE_4) {
      phase = 3
      reason = 'Building back up — progressive strength and conditioning, one step below your top phase.'
      nudge = `About ${SESSIONS_FOR_PHASE_4} logged workouts within three weeks (roughly three a week) unlocks the top phase. It re-checks at the start of each week.`
    }
  }

  return { phase, overridden: false, weeksPostOp, reason, nudge }
}
