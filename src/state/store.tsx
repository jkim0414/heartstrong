import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  AppState,
  DayStatus,
  EquipmentItem,
  ISODate,
  Pattern,
  Profile,
  Workout,
} from '../types'
import { generateWorkout, loadedPatternsOf } from '../engine/generator'
import { determinePhase, type PhaseResult } from '../engine/phase'
import { addDays, todayISO } from '../lib/date'
import { defaultEquipment } from '../data/equipment'
import { useAuth } from './auth'
import { isAuthConfigured, supabase } from '../lib/supabase'

const STORAGE_KEY = 'heartstrong.v1'
const SCHEMA_VERSION = 1

export const DEFAULT_EQUIPMENT: EquipmentItem[] = defaultEquipment()

const DEFAULT_PROFILE: Profile = {
  name: '',
  surgeryDate: null,
  clearedForExercise: false,
  sternalPrecautionsLifted: false,
  phaseOverride: null,
  onboarded: false,
  aiEnabled: true,
}

function defaultState(): AppState {
  return {
    profile: { ...DEFAULT_PROFILE },
    equipment: DEFAULT_EQUIPMENT.map((e) => ({ ...e })),
    log: {},
    overrides: {},
    aiCache: {},
    readiness: {},
    schemaVersion: SCHEMA_VERSION,
  }
}

export function mergeState(parsed: Partial<AppState>): AppState {
  const base = defaultState()
  return {
    ...base,
    ...parsed,
    profile: { ...base.profile, ...parsed.profile },
    equipment: parsed.equipment?.length ? parsed.equipment : base.equipment,
    log: parsed.log ?? {},
    overrides: parsed.overrides ?? {},
    aiCache: parsed.aiCache ?? {},
    readiness: parsed.readiness ?? {},
    schemaVersion: SCHEMA_VERSION,
  }
}

function loadLocal(key: string): AppState {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return defaultState()
    return mergeState(JSON.parse(raw) as Partial<AppState>)
  } catch {
    return defaultState()
  }
}

function saveLocal(key: string, state: AppState) {
  try {
    localStorage.setItem(key, JSON.stringify(state))
  } catch {
    /* storage may be full or blocked; non-fatal */
  }
}

/** Pre-account local data, used for the one-tap "import this device" option. */
export function hasLegacyLocalData(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    return !!(JSON.parse(raw) as Partial<AppState>).profile?.onboarded
  } catch {
    return false
  }
}

async function loadCloud(userId: string): Promise<AppState | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('app_state').select('state').eq('user_id', userId).maybeSingle()
  if (error || !data?.state) return null
  return mergeState(data.state as Partial<AppState>)
}

async function saveCloud(userId: string, state: AppState): Promise<void> {
  if (!supabase) return
  await supabase.from('app_state').upsert({ user_id: userId, state, updated_at: new Date().toISOString() })
}

// ---- Derived stats --------------------------------------------------------

export interface Stats {
  currentStreak: number
  longestStreak: number
  totalWorkouts: number
  thisWeekCount: number
  thisWeekGoal: number
  milestones: Milestone[]
}

export interface Milestone {
  id: string
  label: string
  emoji: string
  earned: boolean
  detail: string
}

/**
 * Streak rules (kind by design for a cardiac patient):
 *  - a completed workout extends the streak,
 *  - a logged rest day FREEZES it (doesn't break, doesn't add),
 *  - a missed/skipped past day breaks it.
 * Today not being logged yet never breaks the streak.
 */
function computeStreak(log: AppState['log'], today: ISODate): number {
  let streak = 0
  let cursor = today
  let isToday = true
  // Safety bound so a corrupt log can't loop forever.
  for (let i = 0; i < 3650; i++) {
    const entry = log[cursor]
    if (entry?.status === 'completed') {
      streak++
    } else if (entry?.status === 'rest') {
      // freeze: neither add nor break
    } else {
      // nothing logged or skipped
      if (!isToday) break
    }
    cursor = addDays(cursor, -1)
    isToday = false
  }
  return streak
}

function computeLongestStreak(log: AppState['log']): number {
  const dates = Object.keys(log).sort()
  if (dates.length === 0) return 0
  let longest = 0
  let run = 0
  let prev: ISODate | null = null
  for (const d of dates) {
    const status = log[d].status
    const contiguous = prev != null && addDays(prev, 1) === d
    if (!contiguous) run = 0
    if (status === 'completed') run++
    else if (status === 'rest') {
      // freeze keeps the run alive but doesn't grow it
    } else {
      run = 0
    }
    longest = Math.max(longest, run)
    prev = d
  }
  return longest
}

function startOfWeek(date: ISODate): ISODate {
  // Week starts Sunday.
  const dow = new Date(date + 'T00:00:00').getDay()
  return addDays(date, -dow)
}

export function computeStats(state: AppState, today: ISODate): Stats {
  const log = state.log
  const totalWorkouts = Object.values(log).filter((e) => e.status === 'completed').length
  const weekStart = startOfWeek(today)
  let thisWeekCount = 0
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i)
    if (log[d]?.status === 'completed') thisWeekCount++
  }
  const currentStreak = computeStreak(log, today)
  const longestStreak = Math.max(computeLongestStreak(log), currentStreak)

  const milestones: Milestone[] = [
    { id: 'first', label: 'First workout', emoji: '🎉', earned: totalWorkouts >= 1, detail: 'You showed up. That’s the hardest rep.' },
    { id: 'streak3', label: '3-day streak', emoji: '🔥', earned: currentStreak >= 3 || longestStreak >= 3, detail: 'Three days in a row.' },
    { id: 'streak7', label: '7-day streak', emoji: '⭐', earned: currentStreak >= 7 || longestStreak >= 7, detail: 'A full week of consistency.' },
    { id: 'total10', label: '10 workouts', emoji: '💪', earned: totalWorkouts >= 10, detail: 'Ten sessions in the books.' },
    { id: 'total25', label: '25 workouts', emoji: '🏅', earned: totalWorkouts >= 25, detail: 'Building a real habit.' },
    { id: 'total50', label: '50 workouts', emoji: '🏆', earned: totalWorkouts >= 50, detail: 'This is a lifestyle now.' },
    { id: 'streak30', label: '30-day streak', emoji: '👑', earned: currentStreak >= 30 || longestStreak >= 30, detail: 'A month of showing up.' },
  ]

  return { currentStreak, longestStreak, totalWorkouts, thisWeekCount, thisWeekGoal: 5, milestones }
}

// ---- Context --------------------------------------------------------------

interface Store {
  state: AppState
  today: ISODate
  phaseResult: PhaseResult
  stats: Stats
  workoutFor: (date: ISODate) => Workout
  /** Loaded movement patterns emphasized the day before `date` (Phase 3+ only; else empty). */
  recentPatternsFor: (date: ISODate) => Pattern[]
  setDayStatus: (date: ISODate, status: DayStatus, extras?: { notes?: string; feltRpe?: number; workoutTitle?: string }) => void
  clearDay: (date: ISODate) => void
  setOverride: (date: ISODate, ov: 'easier' | 'rest' | null) => void
  setAiWorkout: (date: ISODate, workout: Workout) => void
  /** Cache several days at once (weekly plan) — one state update, one sync. */
  setAiWorkouts: (workouts: Record<ISODate, Workout>) => void
  clearAiWorkout: (date: ISODate) => void
  recentTitles: () => string[]
  setReadiness: (date: ISODate, ok: boolean, flagged: string[]) => void
  updateProfile: (patch: Partial<Profile>) => void
  updateEquipment: (eq: EquipmentItem[]) => void
  resetAll: () => void
  /** Copy pre-account data from this device into the current account. */
  importLocalData: () => void
  /** Whether pre-account data exists on this device to import. */
  hasLegacyData: boolean
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const userId = auth.user?.id ?? null
  const storageKey = userId ? `${STORAGE_KEY}.${userId}` : STORAGE_KEY

  const [state, setState] = useState<AppState>(() => loadLocal(STORAGE_KEY))
  const [hydrated, setHydrated] = useState<boolean>(!isAuthConfigured)
  const today = todayISO()
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load the correct state once the user's identity resolves.
  useEffect(() => {
    if (auth.status === 'loading') return
    let cancelled = false
    setHydrated(false)
    void (async () => {
      if (!auth.configured) {
        if (!cancelled) {
          setState(loadLocal(STORAGE_KEY))
          setHydrated(true)
        }
        return
      }
      if (!userId) {
        if (!cancelled) setHydrated(true) // signed out; SignIn screen will show
        return
      }
      // Show this device's cached copy instantly, then reconcile with the cloud.
      if (!cancelled) setState(loadLocal(storageKey))
      const cloud = await loadCloud(userId)
      if (cancelled) return
      if (cloud) {
        setState(cloud)
        saveLocal(storageKey, cloud)
      } else {
        // Brand-new account: start fresh (data can be imported from Settings).
        const seed = defaultState()
        setState(seed)
        saveLocal(storageKey, seed)
        await saveCloud(userId, seed)
      }
      setHydrated(true)
    })()
    return () => {
      cancelled = true
    }
  }, [auth.status, auth.configured, userId, storageKey])

  // Persist on change: local cache always; cloud (debounced) when signed in.
  useEffect(() => {
    if (!hydrated) return
    saveLocal(storageKey, state)
    if (auth.configured && userId) {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => void saveCloud(userId, state), 800)
    }
  }, [state, hydrated, storageKey, auth.configured, userId])

  const phaseResult = useMemo(() => determinePhase(state.profile, today), [state.profile, today])
  const stats = useMemo(() => computeStats(state, today), [state, today])

  const store: Store = useMemo(() => {
    // Loaded patterns emphasized the day before `date` — drives cross-day
    // rotation. Gated to Phase 3+ (no point steering gentle recovery work).
    // Reads yesterday's cached AI workout if present, else regenerates it
    // WITHOUT recentPatterns to avoid infinite recursion.
    const recentPatternsFor = (date: ISODate): Pattern[] => {
      const pr = determinePhase(state.profile, date)
      if (pr.phase < 3 || state.profile.phaseOverride != null) return []
      const prev = addDays(date, -1)
      // Skip if yesterday was a rest day — nothing to recover from.
      if (state.log[prev]?.status === 'rest' || state.overrides[prev] === 'rest') return []
      const cachedAi = state.aiCache[prev]
      const prevPr = determinePhase(state.profile, prev)
      const yesterday =
        cachedAi && cachedAi.phase === prevPr.phase
          ? cachedAi
          : generateWorkout(prev, prevPr.phase, state.profile, state.equipment)
      return loadedPatternsOf(yesterday)
    }

    const workoutFor = (date: ISODate): Workout => {
      const pr = determinePhase(state.profile, date)
      const ov = state.overrides[date]
      const force = ov === 'rest' ? 'rest' : ov === 'easier' ? 'recovery_mobility' : undefined
      const recent = force ? [] : recentPatternsFor(date)
      return generateWorkout(date, pr.phase, state.profile, state.equipment, force, recent)
    }

    return {
      state,
      today,
      phaseResult,
      stats,
      workoutFor,
      recentPatternsFor,
      setDayStatus: (date, status, extras) =>
        setState((s) => ({
          ...s,
          log: {
            ...s.log,
            [date]: {
              date,
              status,
              notes: extras?.notes ?? s.log[date]?.notes,
              feltRpe: extras?.feltRpe ?? s.log[date]?.feltRpe,
              workoutTitle: extras?.workoutTitle ?? s.log[date]?.workoutTitle,
              markedAt: new Date().toISOString(),
            },
          },
        })),
      clearDay: (date) =>
        setState((s) => {
          const log = { ...s.log }
          delete log[date]
          return { ...s, log }
        }),
      setOverride: (date, ov) =>
        setState((s) => {
          const overrides = { ...s.overrides }
          if (ov == null) delete overrides[date]
          else overrides[date] = ov
          return { ...s, overrides }
        }),
      setAiWorkout: (date, workout) => setState((s) => ({ ...s, aiCache: { ...s.aiCache, [date]: workout } })),
      setAiWorkouts: (workouts) => setState((s) => ({ ...s, aiCache: { ...s.aiCache, ...workouts } })),
      clearAiWorkout: (date) =>
        setState((s) => {
          const aiCache = { ...s.aiCache }
          delete aiCache[date]
          return { ...s, aiCache }
        }),
      recentTitles: () =>
        Object.values(state.log)
          .sort((a, b) => (a.markedAt < b.markedAt ? 1 : -1))
          .map((e) => e.workoutTitle)
          .filter((t): t is string => !!t),
      setReadiness: (date, ok, flagged) =>
        setState((s) => ({ ...s, readiness: { ...s.readiness, [date]: { ok, flagged } } })),
      updateProfile: (patch) => setState((s) => ({ ...s, profile: { ...s.profile, ...patch } })),
      updateEquipment: (eq) => setState((s) => ({ ...s, equipment: eq })),
      resetAll: () => setState(defaultState()),
      importLocalData: () => setState(loadLocal(STORAGE_KEY)),
      hasLegacyData: hasLegacyLocalData(),
    }
  }, [state, today, phaseResult, stats])

  // Brief splash while the cloud copy loads for a signed-in user.
  if (auth.configured && (auth.status === 'loading' || (!!userId && !hydrated))) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-100">
        <span className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-700" />
      </div>
    )
  }

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
