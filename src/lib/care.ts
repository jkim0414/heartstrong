import { supabase } from './supabase'
import { mergeState } from '../state/store'
import type { AppState } from '../types'

export interface ShareLink {
  id: string
  code: string
  patient_label: string | null
  caregiver_id: string | null
  accepted_at: string | null
}

export interface Follow {
  id: string
  patient_id: string
  patient_label: string | null
  accepted_at: string | null
}

// Unambiguous alphabet (no 0/O/1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function generateCode(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

/** Patient: create a new share code others can redeem. */
export async function createShareCode(label: string): Promise<ShareLink | null> {
  if (!supabase) return null
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return null
  const code = generateCode()
  const { data, error } = await supabase
    .from('care_links')
    .insert({ patient_id: uid, patient_label: label || null, code })
    .select('id, code, patient_label, caregiver_id, accepted_at')
    .single()
  if (error) throw error
  return data as ShareLink
}

/** Patient: list the share codes they've created. */
export async function listShares(): Promise<ShareLink[]> {
  if (!supabase) return []
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return []
  const { data } = await supabase
    .from('care_links')
    .select('id, code, patient_label, caregiver_id, accepted_at')
    .eq('patient_id', uid)
    .order('created_at', { ascending: false })
  return (data ?? []) as ShareLink[]
}

/** Patient: revoke a share code (also cuts off a connected caregiver). */
export async function revokeShare(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('care_links').delete().eq('id', id)
}

/** Caregiver: redeem a code to start following a patient. */
export async function followByCode(code: string): Promise<{ patient_id: string; patient_label: string | null }> {
  if (!supabase) throw new Error('Not configured')
  const { data, error } = await supabase.rpc('claim_care_link', { p_code: code.trim().toUpperCase() })
  if (error) throw new Error(error.message)
  const row = Array.isArray(data) ? data[0] : data
  return { patient_id: row.patient_id, patient_label: row.patient_label }
}

/** Caregiver: list the patients they follow. */
export async function listFollows(): Promise<Follow[]> {
  if (!supabase) return []
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return []
  const { data } = await supabase
    .from('care_links')
    .select('id, patient_id, patient_label, accepted_at')
    .eq('caregiver_id', uid)
    .order('accepted_at', { ascending: false })
  return (data ?? []) as Follow[]
}

/** Caregiver: stop following. */
export async function unfollow(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('care_links').delete().eq('id', id)
}

/** Caregiver: read a followed patient's full state (RLS permits read-only). */
export async function getPatientState(patientId: string): Promise<AppState | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('app_state').select('state').eq('user_id', patientId).maybeSingle()
  if (error || !data?.state) return null
  return mergeState(data.state as Partial<AppState>)
}
