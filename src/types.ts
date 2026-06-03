// ---------------------------------------------------------------------------
// Core domain types for HeartStrong
// ---------------------------------------------------------------------------

/** A YYYY-MM-DD calendar date string in the user's local timezone. */
export type ISODate = string

/** Phases of the progressive program. Higher = more capable. */
export type PhaseId = 1 | 2 | 3 | 4

/** Movement patterns, used to balance a session and rotate emphasis. */
export type Pattern =
  | 'locomotion' // walking, marching, jump rope, shuttle
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'push'
  | 'pull'
  | 'core'
  | 'carry'
  | 'mobility'
  | 'breathing'

export type Block = 'warmup' | 'strength' | 'metcon' | 'cooldown'

/**
 * Equipment ids are stable strings referenced by movements. Known ids appear
 * in the catalog (data/equipment.ts); users may also add custom ids.
 */
export type EquipmentId = string

export interface EquipmentItem {
  id: EquipmentId
  label: string
  /** Whether the user currently has this. */
  owned: boolean
  /** For loadable items (dumbbells, kettlebell): weights available, in lb. */
  weightsLb?: number[]
  /** Not user-removable (e.g. bodyweight, open space). */
  fixed?: boolean
  /** True for user-added items that aren't in the built-in catalog. */
  custom?: boolean
}

/** A single movement definition in the library. */
export interface Movement {
  id: string
  name: string
  pattern: Pattern
  /** Equipment required — ALL must be owned ('bodyweight' is always owned). */
  requires: EquipmentId[]
  /** Earliest phase this movement may appear in. */
  minPhase: PhaseId
  /**
   * Whether this movement loads the chest/sternum or bears weight through the
   * arms. If true it is withheld until sternal precautions are lifted.
   */
  sternalLoad: boolean
  /** 0 = no impact (walking), 1 = light, 2 = moderate (jumping). */
  impact: 0 | 1 | 2
  /** Short coaching cue shown to the user. */
  cue: string
  /** Optional easier substitution suggestion. */
  scaleDown?: string
  /** Tags that let the generator pick by role. */
  tags?: string[]
}

/** A concrete prescribed item inside a generated workout block. */
export interface PrescribedItem {
  movementId: string
  name: string
  cue: string
  scaleDown?: string
  /** Human-readable dose, e.g. "2 sets × 10" or "Walk 3 min easy". */
  dose: string
  /** Suggested dumbbell load in lb, if applicable. */
  loadLb?: number
}

export interface WorkoutBlock {
  block: Block
  title: string
  /** Optional format line, e.g. "AMRAP 10 min" or "3 rounds for quality". */
  format?: string
  items: PrescribedItem[]
  /** Coaching note specific to this block. */
  note?: string
}

export interface Workout {
  /** The date this workout is for. */
  date: ISODate
  phase: PhaseId
  /** Short title, e.g. "Strength + Short Metcon". */
  title: string
  /** One-line plain-language summary of the day's intent. */
  summary: string
  /** Estimated total time in minutes. */
  estMinutes: number
  /** Target perceived exertion, Borg CR10 scale (0–10). */
  rpeLow: number
  rpeHigh: number
  /** Talk-test guidance string matched to the RPE target. */
  talkTest: string
  blocks: WorkoutBlock[]
  /** True for rest / active-recovery days. */
  isRecovery: boolean
}

export type DayStatus = 'completed' | 'rest' | 'skipped'

export interface LogEntry {
  date: ISODate
  status: DayStatus
  notes?: string
  /** How hard it felt, if they logged it (Borg CR10). */
  feltRpe?: number
  /** ISO timestamp when marked. */
  markedAt: string
  /** Snapshot title of what they did, for history. */
  workoutTitle?: string
}

export interface Profile {
  /** Which experience this account uses. Undefined (legacy) is treated as patient. */
  role?: 'patient' | 'caregiver'
  name: string
  /** Date of the bypass (CABG) surgery. */
  surgeryDate: ISODate | null
  /** Cleared to exercise by cardiologist / cardiac rehab team. */
  clearedForExercise: boolean
  /** Surgeon has lifted sternal precautions (cleared for upper-body loading). */
  sternalPrecautionsLifted: boolean
  /** Enrolled in or completed a supervised cardiac rehab program. */
  inCardiacRehab: boolean
  /** Manual phase override (advanced; otherwise auto from dates). null = auto. */
  phaseOverride: PhaseId | null
  /** Whether onboarding has been completed. */
  onboarded: boolean
  /** Use the AI workout generator (online) instead of the built-in engine. */
  aiEnabled: boolean
}

/** Raw shape the AI endpoint returns; validated before use. */
export interface RawAiWorkout {
  title: string
  summary: string
  estMinutes: number
  rpeLow: number
  rpeHigh: number
  talkTest?: string
  isRecovery?: boolean
  blocks: {
    block: Block
    title: string
    format?: string
    note?: string
    items: { movementId: string; dose: string; loadLb?: number }[]
  }[]
}

export interface AppState {
  profile: Profile
  equipment: EquipmentItem[]
  /** Keyed by ISODate. */
  log: Record<ISODate, LogEntry>
  /** Per-day plan overrides chosen by the user (swap to easier / rest). */
  overrides: Record<ISODate, 'easier' | 'rest'>
  /** Validated AI-generated workouts, cached per day (stable + works offline). */
  aiCache: Record<ISODate, Workout>
  /** Readiness checks the user answered, keyed by date. */
  readiness: Record<ISODate, { ok: boolean; flagged: string[] }>
  schemaVersion: number
}
