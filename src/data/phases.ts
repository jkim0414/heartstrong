import type { PhaseId } from '../types'

export interface PhaseDef {
  id: PhaseId
  name: string
  tagline: string
  /** Plain-language description of intent. */
  description: string
  rpeLow: number
  rpeHigh: number
  /** Talk-test guidance for the phase's hardest efforts. */
  talkTest: string
  /** Does this phase allow loaded upper-body / chest work? */
  allowsSternalLoad: boolean
  /** Strength sessions per week target. */
  strengthDays: number
  /** Theme color token used in the UI. */
  color: string
}

export const PHASES: Record<PhaseId, PhaseDef> = {
  1: {
    id: 1,
    name: 'Phase 1 · Recover',
    tagline: 'Rebuild the base — walking, breathing, gentle legs',
    description:
      'Your breastbone is still healing, so the arms stay light and the work stays easy. This is not “nothing” — daily walking and easy leg work are exactly what rebuilds the foundation strength and conditioning are built on. Stay conversational the whole time.',
    rpeLow: 2,
    rpeHigh: 3,
    talkTest: 'You should be able to hold a full conversation throughout.',
    allowsSternalLoad: false,
    strengthDays: 0,
    color: 'sky',
  },
  2: {
    id: 2,
    name: 'Phase 2 · Rebuild',
    tagline: 'Add light strength and steady intervals',
    description:
      'Sternal precautions are lifted, so we begin real (but light) resistance training and slightly longer conditioning intervals. The dose is deliberately conservative while your body adapts — this is where scaled CrossFit truly begins.',
    rpeLow: 3,
    rpeHigh: 5,
    talkTest: 'On the harder pieces you should still be able to speak in short sentences.',
    allowsSternalLoad: true,
    strengthDays: 2,
    color: 'teal',
  },
  3: {
    id: 3,
    name: 'Phase 3 · Build',
    tagline: 'Progressive strength + true metcons',
    description:
      'Now we build. Dumbbell strength progresses with real intent, and the metcons (AMRAPs, intervals, rounds for time) are scaled to move the needle on your engine. Intensity is earned and always followed by full recovery.',
    rpeLow: 4,
    rpeHigh: 7,
    talkTest: 'During hard intervals you may only get a few words out — that’s the target ceiling.',
    allowsSternalLoad: true,
    strengthDays: 2,
    color: 'emerald',
  },
  4: {
    id: 4,
    name: 'Phase 4 · Perform',
    tagline: 'Varied, progressive scaled CrossFit',
    description:
      'A sustainable, varied training life: progressive strength, mixed-modal metcons, and occasional benchmark retests so you can see the gains. Hard is allowed; maximal is not.',
    rpeLow: 4,
    rpeHigh: 8,
    talkTest: 'Short, hard intervals can reach “a few words only” — never go to where you cannot talk at all.',
    allowsSternalLoad: true,
    strengthDays: 3,
    color: 'emerald',
  },
}

// ---------------------------------------------------------------------------
// Weekly session schedule per phase. Index 0 = Sunday ... 6 = Saturday.
// Archetype ids are resolved by the generator.
// ---------------------------------------------------------------------------
export type Archetype =
  | 'rest'
  | 'walk_easy'
  | 'walk_intervals'
  | 'walk_legs'
  | 'recovery_mobility'
  | 'aerobic_intervals'
  | 'strength_full'
  | 'strength_metcon'
  | 'metcon_mixed'
  | 'strength_long_aerobic'

export const WEEKLY_SCHEDULE: Record<PhaseId, Archetype[]> = {
  // Sun, Mon, Tue, Wed, Thu, Fri, Sat
  1: ['recovery_mobility', 'walk_legs', 'walk_intervals', 'walk_legs', 'walk_easy', 'walk_legs', 'walk_intervals'],
  2: ['rest', 'strength_metcon', 'aerobic_intervals', 'recovery_mobility', 'strength_full', 'aerobic_intervals', 'strength_long_aerobic'],
  3: ['rest', 'strength_metcon', 'metcon_mixed', 'recovery_mobility', 'strength_metcon', 'aerobic_intervals', 'strength_long_aerobic'],
  4: ['rest', 'strength_metcon', 'metcon_mixed', 'recovery_mobility', 'strength_metcon', 'metcon_mixed', 'strength_long_aerobic'],
}
