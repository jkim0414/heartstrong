import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  AppState,
  DayStatus,
  EquipmentItem,
  ISODate,
  LogEntry,
  Pattern,
  Profile,
  Workout,
} from '../types'
import { deterministicFor, planFor, recentPatternsFor } from '../engine/plan'
import { decideSync, type CloudResult, type SyncMeta } from './sync'
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

/** This device's cached copy for `key`, or null if it has none. */
function readLocal(key: string): AppState | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? mergeState(JSON.parse(raw) as Partial<AppState>) : null
  } catch {
    return null
  }
}

function loadMeta(key: string): SyncMeta {
  try {
    const raw = localStorage.getItem(`${key}::sync`)
    if (raw) return JSON.parse(raw) as SyncMeta
  } catch {
    /* fall through */
  }
  return { lastSyncedAt: null, dirty: false }
}

function saveMeta(key: string, meta: SyncMeta) {
  try {
    localStorage.setItem(`${key}::sync`, JSON.stringify(meta))
  } catch {
    /* non-fatal */
  }
}

/**
 * Resolve with `fallback` if `work` hasn't settled in `ms`. The Supabase client
 * retries a token refresh for ~30s before a request even leaves when its
 * server is unreachable; nothing in the app should wait on that.
 */
function within<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([work, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))])
}

const CLOUD_READ_TIMEOUT_MS = 10_000
const CLOUD_WRITE_TIMEOUT_MS = 15_000

/** Logged days in the pre-account copy on this device (0 if none). */
function legacyLoggedDays(): number {
  return Object.keys(readLocal(STORAGE_KEY)?.log ?? {}).length
}

async function loadCloud(userId: string): Promise<CloudResult> {
  const client = supabase
  if (!client) return { ok: false }
  const read = async (): Promise<CloudResult> => {
    try {
      const { data, error } = await client.from('app_state').select('state, updated_at').eq('user_id', userId).maybeSingle()
      if (error) return { ok: false }
      if (!data?.state) return { ok: true, state: null, updatedAt: null }
      return { ok: true, state: mergeState(data.state as Partial<AppState>), updatedAt: (data.updated_at as string) ?? null }
    } catch {
      return { ok: false }
    }
  }
  return within(read(), CLOUD_READ_TIMEOUT_MS, { ok: false })
}

/** Upload the whole state. Returns the stored `updated_at`, or null on failure. */
async function saveCloud(userId: string, state: AppState): Promise<string | null> {
  const client = supabase
  if (!client) return null
  const updatedAt = new Date().toISOString()
  const write = async (): Promise<string | null> => {
    try {
      const { error } = await client.from('app_state').upsert({ user_id: userId, state, updated_at: updatedAt })
      return error ? null : updatedAt
    } catch {
      return null
    }
  }
  return within(write(), CLOUD_WRITE_TIMEOUT_MS, null)
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
  /** The built-in engine's plan for `date` (overrides honored). */
  workoutFor: (date: ISODate) => Workout
  /** The plan the patient sees/saw for `date`: valid cached AI plan, else built-in. */
  planFor: (date: ISODate) => { workout: Workout; isAi: boolean }
  /** Loaded movement patterns emphasized the day before `date` (Phase 3+ only; else empty). */
  recentPatternsFor: (date: ISODate) => Pattern[]
  setDayStatus: (date: ISODate, status: DayStatus, extras?: { notes?: string; feltRpe?: number; workoutTitle?: string; loadFeel?: LogEntry['loadFeel']; score?: string }) => void
  clearDay: (date: ISODate) => void
  setOverride: (date: ISODate, ov: 'easier' | 'rest' | null) => void
  setAiWorkout: (date: ISODate, workout: Workout) => void
  /** Cache several days at once (weekly plan) — one state update, one sync. */
  setAiWorkouts: (workouts: Record<ISODate, Workout>) => void
  clearAiWorkout: (date: ISODate) => void
  /** Titles of recently completed workouts, newest first. */
  recentTitles: () => string[]
  setReadiness: (date: ISODate, ok: boolean, flagged: string[]) => void
  updateProfile: (patch: Partial<Profile>) => void
  updateEquipment: (eq: EquipmentItem[]) => void
  resetAll: () => void
  /** Copy pre-account data from this device into the current account. */
  importLocalData: () => void
  /** Whether pre-account data exists on this device to import. */
  hasLegacyData: boolean
  /** How many logged days that pre-account copy holds (to judge an import). */
  legacyLoggedDays: number
  /** Cloud sync health, so an unreachable account is visible instead of silent. */
  sync: SyncStatus
  /** Try to reach the account again now (e.g. from a "Try again" button). */
  retrySync: () => void
}

/**
 * - `local`: no account backend; data lives on this device only.
 * - `synced` / `saving`: the account is reachable.
 * - `unreachable`: the last attempt to reach the account failed. The app keeps
 *   working from this device's copy and uploads once it can.
 */
export type SyncStatus = 'local' | 'synced' | 'saving' | 'unreachable'

const StoreContext = createContext<Store | null>(null)

/** Cached AI plans older than this are dropped — the whole state is re-uploaded on every change. */
const AI_CACHE_RETENTION_DAYS = 120

function pruneAiCache(cache: AppState['aiCache'], today: ISODate): AppState['aiCache'] {
  const cutoff = addDays(today, -AI_CACHE_RETENTION_DAYS)
  const out: AppState['aiCache'] = {}
  for (const [d, w] of Object.entries(cache)) if (d >= cutoff) out[d] = w
  return out
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const userId = auth.user?.id ?? null
  const storageKey = userId ? `${STORAGE_KEY}.${userId}` : STORAGE_KEY

  // The account-less key is this app's storage ONLY in local-only mode. With
  // accounts on, it is read-only pre-account data (an import source) and one
  // account's state must never be written there.
  const [state, setState] = useState<AppState>(() => (isAuthConfigured ? defaultState() : loadLocal(STORAGE_KEY)))
  const [hydrated, setHydrated] = useState<boolean>(!isAuthConfigured)
  const [loadError, setLoadError] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(isAuthConfigured ? 'synced' : 'local')
  // Bumped when the app returns to the foreground so `today` rolls over even if
  // the PWA was left open overnight.
  const [, setClock] = useState(0)
  const today = todayISO()
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Latest state for async callbacks, and the last state object that came FROM
  // the cloud (applying it must not trigger a redundant re-upload).
  const stateRef = useRef(state)
  stateRef.current = state
  const remoteStateRef = useRef<AppState | null>(null)
  const sync = useRef<{ meta: SyncMeta; verified: boolean; busy: boolean }>({
    meta: { lastSyncedAt: null, dirty: false },
    verified: false,
    busy: false,
  })
  const persistMeta = () => saveMeta(storageKey, sync.current.meta)

  /** Upload the current state if the cloud copy has been verified this session. */
  const pushNow = async (): Promise<void> => {
    if (!auth.configured || !userId) return
    if (!sync.current.verified) return void reconcile()
    const snapshot = stateRef.current
    const at = await saveCloud(userId, snapshot)
    if (at) {
      sync.current.meta = { lastSyncedAt: at, dirty: stateRef.current !== snapshot }
      persistMeta()
      setSyncStatus(sync.current.meta.dirty ? 'saving' : 'synced')
    } else {
      setSyncStatus('unreachable')
    }
  }

  /** Re-read the cloud and settle any divergence (foreground, reconnect, first push). */
  const reconcile = async (): Promise<void> => {
    if (!auth.configured || !userId || sync.current.busy) return
    sync.current.busy = true
    try {
      const cloud = await loadCloud(userId)
      if (!cloud.ok) {
        setSyncStatus('unreachable')
        return
      }
      // Common case: nothing changed on either side — don't churn state.
      if (cloud.state && cloud.updatedAt === sync.current.meta.lastSyncedAt && !sync.current.meta.dirty) {
        sync.current.verified = true
        setSyncStatus('synced')
        return
      }
      const d = decideSync(cloud, stateRef.current, sync.current.meta, defaultState)
      if (d.kind !== 'use') return
      sync.current.verified = d.verified
      sync.current.meta = { lastSyncedAt: d.lastSyncedAt, dirty: d.push }
      persistMeta()
      if (d.state !== stateRef.current) {
        if (!d.push) remoteStateRef.current = d.state
        setState(d.state)
      }
      if (d.push) {
        const at = await saveCloud(userId, d.state)
        if (at) {
          sync.current.meta = { lastSyncedAt: at, dirty: false }
          persistMeta()
        }
        setSyncStatus(at ? 'synced' : 'unreachable')
      } else {
        setSyncStatus('synced')
      }
    } finally {
      sync.current.busy = false
    }
  }

  // Load the correct state once the user's identity resolves.
  useEffect(() => {
    if (auth.status === 'loading') return
    let cancelled = false
    setHydrated(false)
    setLoadError(false)
    void (async () => {
      if (!auth.configured) {
        if (!cancelled) {
          setState(loadLocal(STORAGE_KEY))
          setHydrated(true)
        }
        return
      }
      if (!userId) {
        // Signed out: the SignIn screen shows. Drop the previous account's data
        // from memory so it can't leak into storage or the next sign-in.
        if (!cancelled) {
          remoteStateRef.current = null
          setState(defaultState())
          setHydrated(true)
        }
        return
      }
      const local = readLocal(storageKey)
      const meta = loadMeta(storageKey)
      if (local?.profile.onboarded) {
        // Offline-first: this device already has their data, so show it now
        // and settle with the cloud in the background. Launch never waits on
        // the network, and an unreachable server can't block the app.
        sync.current = { meta, verified: false, busy: false }
        remoteStateRef.current = local // loaded, not edited — nothing to upload
        stateRef.current = local
        setState(local)
        setSyncStatus(meta.dirty ? 'saving' : 'synced')
        setHydrated(true)
        void reconcile()
        return
      }
      // Nothing usable on this device: the cloud copy is the only source.
      const cloud = await loadCloud(userId)
      if (cancelled) return
      const d = decideSync(cloud, local, meta, defaultState)
      if (d.kind === 'error') {
        // Couldn't reach the account and nothing cached here: never fall back
        // to onboarding (a re-onboarded empty state would later overwrite the
        // real cloud history). Offer a retry instead.
        setLoadError(true)
        return
      }
      sync.current = { meta: { lastSyncedAt: d.lastSyncedAt, dirty: d.push || (!d.verified && meta.dirty) }, verified: d.verified, busy: false }
      saveMeta(storageKey, sync.current.meta)
      if (!d.push) remoteStateRef.current = d.state
      setState(d.state)
      saveLocal(storageKey, d.state)
      setSyncStatus(!d.verified ? 'unreachable' : d.push ? 'saving' : 'synced')
      setHydrated(true)
      if (d.push) {
        const at = await saveCloud(userId, d.state)
        if (cancelled) return
        if (at) {
          sync.current.meta = { lastSyncedAt: at, dirty: false }
          saveMeta(storageKey, sync.current.meta)
        }
        setSyncStatus(at ? 'synced' : 'unreachable')
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.status, auth.configured, userId, storageKey, retryNonce])

  // Persist on change: local cache always; cloud (debounced) when signed in.
  useEffect(() => {
    if (!hydrated) return
    // Signed out with accounts on: nothing to persist. (Saving here would copy
    // the just-signed-out person's data into the shared, account-less key —
    // where the next person to sign in on this device would be offered it.)
    if (auth.configured && !userId) return
    saveLocal(storageKey, state)
    if (!auth.configured || !userId) return
    if (state === remoteStateRef.current) return // just arrived from the cloud
    sync.current.meta = { ...sync.current.meta, dirty: true }
    persistMeta()
    if (sync.current.verified) setSyncStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void pushNow(), 800)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, hydrated, storageKey, auth.configured, userId])

  // Returning to the app (or regaining signal): roll the date over, pick up
  // changes made elsewhere, and retry any upload that failed while offline.
  useEffect(() => {
    if (!hydrated) return
    const onWake = () => {
      if (document.visibilityState !== 'visible') return
      setClock(Date.now())
      void reconcile()
    }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('online', onWake)
    return () => {
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('online', onWake)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, userId])

  const phaseResult = useMemo(() => determinePhase(state.profile, today, state.log), [state.profile, state.log, today])
  const stats = useMemo(() => computeStats(state, today), [state, today])

  const store: Store = useMemo(() => {
    return {
      state,
      today,
      phaseResult,
      stats,
      workoutFor: (date) => deterministicFor(state, date),
      planFor: (date) => planFor(state, date, today),
      recentPatternsFor: (date) => recentPatternsFor(state, date),
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
              loadFeel: extras?.loadFeel ?? s.log[date]?.loadFeel,
              score: extras?.score ?? s.log[date]?.score,
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
      setAiWorkout: (date, workout) => setState((s) => ({ ...s, aiCache: pruneAiCache({ ...s.aiCache, [date]: workout }, todayISO()) })),
      setAiWorkouts: (workouts) => setState((s) => ({ ...s, aiCache: pruneAiCache({ ...s.aiCache, ...workouts }, todayISO()) })),
      clearAiWorkout: (date) =>
        setState((s) => {
          const aiCache = { ...s.aiCache }
          delete aiCache[date]
          return { ...s, aiCache }
        }),
      recentTitles: () =>
        Object.values(state.log)
          .filter((e) => e.status === 'completed')
          .sort((a, b) => (a.markedAt < b.markedAt ? 1 : -1))
          .map((e) => e.workoutTitle)
          .filter((t): t is string => !!t),
      // A symptom reported once today stays on record even if a later re-check
      // passes — the caregiver should still see it. `ok` reflects the latest check.
      setReadiness: (date, ok, flagged) =>
        setState((s) => {
          const prior = s.readiness[date]?.flagged ?? []
          return { ...s, readiness: { ...s.readiness, [date]: { ok, flagged: [...new Set([...prior, ...flagged])] } } }
        }),
      updateProfile: (patch) =>
        setState((s) => {
          const next = { ...s.profile, ...patch }
          // Stamp when sternal precautions lift (drives the Phase-2 ramp-in
          // dwell); clear the stamp if they're ever re-instated.
          if (patch.sternalPrecautionsLifted === true && !s.profile.sternalPrecautionsLifted) {
            next.sternalPrecautionsLiftedOn = todayISO()
          } else if (patch.sternalPrecautionsLifted === false && s.profile.sternalPrecautionsLifted) {
            next.sternalPrecautionsLiftedOn = null
          }
          return { ...s, profile: next }
        }),
      updateEquipment: (eq) => setState((s) => ({ ...s, equipment: eq })),
      resetAll: () => setState(defaultState()),
      importLocalData: () => {
        const legacy = readLocal(STORAGE_KEY)
        if (!legacy) return
        setState(legacy)
        // A one-time migration: remove the source so an old copy can never be
        // re-imported later over newer account data.
        try {
          localStorage.removeItem(STORAGE_KEY)
        } catch {
          /* non-fatal */
        }
      },
      hasLegacyData: auth.configured && !!userId && hasLegacyLocalData(),
      legacyLoggedDays: legacyLoggedDays(),
      sync: syncStatus,
      retrySync: () => void reconcile(),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, today, phaseResult, stats, syncStatus])

  if (loadError) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-slate-100 px-6 text-center">
        <p className="text-4xl">📡</p>
        <p className="text-xl font-bold text-slate-900">Can’t reach your account</p>
        <p className="max-w-sm text-base text-slate-600">
          Check your internet connection and try again. Your workout history is safe — nothing has been changed.
        </p>
        <button
          onClick={() => setRetryNonce((n) => n + 1)}
          className="rounded-xl bg-brand-700 px-6 py-3 text-base font-semibold text-white"
        >
          Try again
        </button>
        <button onClick={() => void auth.signOut()} className="text-sm font-semibold text-slate-500 underline">
          Sign out
        </button>
      </div>
    )
  }

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
