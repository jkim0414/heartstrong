import type { EquipmentItem, ISODate, Pattern, PhaseId, Profile, RawAiWorkout, Workout } from '../types'
import { PHASES, WEEKLY_SCHEDULE } from '../data/phases'
import { getEligibleMovements, loadableLoads } from './generator'
import { validateAiWeek, validateAiWorkout } from './validate'
import { weekday } from '../lib/date'
import { getAccessToken } from '../state/auth'

/** Endpoint for the serverless function that holds the API key. */
const ENDPOINT = '/api/generate'

export interface AiRequest {
  date: ISODate
  weekdayName: string
  phase: PhaseId
  phaseName: string
  phaseTagline: string
  rpeLow: number
  rpeHigh: number
  talkTest: string
  allowsSternalLoad: boolean
  /** Suggested session shape for the day (the model may riff within reason). */
  suggestedFocus: string
  /** Owned loadable equipment id -> available weights (lb). */
  loads: Record<string, number[]>
  recentTitles: string[]
  /** Loaded movement patterns emphasized yesterday — steer today's emphasis away from these. */
  recentPatterns: Pattern[]
  /** The ONLY movements the model may use — already safety-filtered. */
  movements: { id: string; name: string; pattern: string; cue: string }[]
  /** Optional health background, for caution context only. */
  conditions?: string
  medications?: string
  careNotes?: string
  /** Whether the model should consider salting for a fresh variation. */
  salt: number
}

const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function buildRequest(
  date: ISODate,
  phase: PhaseId,
  profile: Profile,
  equipment: EquipmentItem[],
  recentTitles: string[],
  recentPatterns: Pattern[],
  salt: number,
): AiRequest {
  const def = PHASES[phase]
  const movements = getEligibleMovements(phase, profile, equipment).map((m) => ({
    id: m.id,
    name: m.name,
    pattern: m.pattern,
    cue: m.cue,
  }))
  return {
    date,
    weekdayName: WD[weekday(date)],
    phase,
    phaseName: def.name,
    phaseTagline: def.tagline,
    rpeLow: def.rpeLow,
    rpeHigh: def.rpeHigh,
    talkTest: def.talkTest,
    allowsSternalLoad: def.allowsSternalLoad && profile.sternalPrecautionsLifted,
    suggestedFocus: WEEKLY_SCHEDULE[phase][weekday(date)],
    loads: loadableLoads(equipment),
    recentTitles: recentTitles.slice(0, 10),
    recentPatterns: phase >= 3 ? recentPatterns : [],
    movements,
    conditions: profile.conditions || undefined,
    medications: profile.medications || undefined,
    careNotes: profile.careNotes || undefined,
    salt,
  }
}

/**
 * Ask the AI endpoint for a workout, then validate it locally. Returns a fully
 * validated Workout, or null on any failure (network/offline/invalid) so the
 * caller can fall back to the deterministic engine.
 */
export async function fetchAiWorkout(
  date: ISODate,
  phase: PhaseId,
  profile: Profile,
  equipment: EquipmentItem[],
  recentTitles: string[],
  recentPatterns: Pattern[] = [],
  salt = 0,
): Promise<Workout | null> {
  try {
    const body = buildRequest(date, phase, profile, equipment, recentTitles, recentPatterns, salt)
    const token = await getAccessToken()
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    const raw = (await res.json()) as RawAiWorkout
    const { workout } = validateAiWorkout(raw, date, phase, profile, equipment)
    return workout
  } catch {
    return null
  }
}

/**
 * Ask the AI endpoint to program a whole block of training days as one
 * coherent week. Returns a map of date -> validated Workout; days the model
 * botched are simply absent (deterministic engine covers them). Returns null
 * on any transport failure so the caller can fall back entirely.
 */
export async function fetchAiWeek(
  dates: ISODate[],
  phase: PhaseId,
  profile: Profile,
  equipment: EquipmentItem[],
  recentTitles: string[],
  recentPatterns: Pattern[] = [],
  adherence?: string,
): Promise<Record<ISODate, Workout> | null> {
  if (dates.length === 0) return {}
  try {
    const body = {
      ...buildRequest(dates[0], phase, profile, equipment, recentTitles, recentPatterns, 0),
      weekDays: dates.map((d) => ({
        date: d,
        weekdayName: WD[weekday(d)],
        suggestedFocus: WEEKLY_SCHEDULE[phase][weekday(d)],
      })),
      adherence,
    }
    const token = await getAccessToken()
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    const raw = (await res.json()) as { days?: (RawAiWorkout & { date?: string })[] }
    return validateAiWeek(raw, dates, phase, profile, equipment)
  } catch {
    return null
  }
}
