import type { AppState } from '../types'

// ---------------------------------------------------------------------------
// Cloud-sync decisions, kept pure so every branch is testable without React or
// a network. The store persists one whole-state JSON row per user; these rules
// decide which copy wins when this device and the cloud may disagree.
// ---------------------------------------------------------------------------

/** Per-device bookkeeping, persisted next to the cached state. */
export interface SyncMeta {
  /** `updated_at` of the cloud row as of our last successful read or write. */
  lastSyncedAt: string | null
  /** This device has changes the cloud hasn't confirmed receiving. */
  dirty: boolean
}

export type CloudResult =
  | { ok: true; state: AppState | null; updatedAt: string | null }
  /** The request failed (offline, outage) — says nothing about what's stored. */
  | { ok: false }

export type SyncDecision =
  | {
      kind: 'use'
      state: AppState
      /** Upload `state` once applied (the cloud is behind or missing). */
      push: boolean
      /** The cloud was actually read, so a later push won't blindly overwrite unseen data. */
      verified: boolean
      lastSyncedAt: string | null
    }
  /** No usable copy anywhere we could reach — show a retry screen, never onboarding. */
  | { kind: 'error' }

/**
 * Decide which state to use given what the cloud returned and what this device
 * holds. The cardinal rule: a FAILED read must never be treated as "new
 * account" — that would replace real history with an empty default and then
 * upload it over the cloud copy.
 */
export function decideSync(cloud: CloudResult, local: AppState | null, meta: SyncMeta, fresh: () => AppState): SyncDecision {
  const localUsable = !!local?.profile.onboarded

  if (!cloud.ok) {
    return localUsable
      ? { kind: 'use', state: local!, push: false, verified: false, lastSyncedAt: meta.lastSyncedAt }
      : { kind: 'error' }
  }

  // No row yet: a brand-new account, or a first upload that never landed.
  if (!cloud.state) {
    return { kind: 'use', state: localUsable ? local! : fresh(), push: true, verified: true, lastSyncedAt: null }
  }

  if (!localUsable || !meta.dirty) {
    return { kind: 'use', state: cloud.state, push: false, verified: true, lastSyncedAt: cloud.updatedAt }
  }

  // This device has unsynced edits. If the cloud hasn't moved since we last
  // synced (or holds only a never-onboarded shell), ours is strictly newer;
  // otherwise both changed — merge.
  if (cloud.updatedAt === meta.lastSyncedAt || !cloud.state.profile.onboarded) {
    return { kind: 'use', state: local!, push: true, verified: true, lastSyncedAt: cloud.updatedAt }
  }
  return { kind: 'use', state: mergeForSync(local!, cloud.state), push: true, verified: true, lastSyncedAt: cloud.updatedAt }
}

/**
 * Merge two diverged copies. Date-keyed records are unioned so no logged
 * workout or reported symptom is lost; on the same date the later-marked log
 * entry wins. Profile and equipment come from this device (its edits are the
 * newest the user made here).
 */
export function mergeForSync(local: AppState, cloud: AppState): AppState {
  const log = { ...cloud.log }
  for (const [date, entry] of Object.entries(local.log)) {
    const other = cloud.log[date]
    if (!other || (entry.markedAt ?? '') >= (other.markedAt ?? '')) log[date] = entry
  }
  const readiness = { ...cloud.readiness }
  for (const [date, r] of Object.entries(local.readiness)) {
    const other = cloud.readiness[date]
    readiness[date] = other ? { ok: r.ok, flagged: [...new Set([...other.flagged, ...r.flagged])] } : r
  }
  return {
    ...cloud,
    profile: local.profile,
    equipment: local.equipment,
    log,
    readiness,
    overrides: { ...cloud.overrides, ...local.overrides },
    aiCache: { ...cloud.aiCache, ...local.aiCache },
  }
}
