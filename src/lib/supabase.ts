import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Read from Vite env. When unset (local dev or a static deploy with no backend),
// the app runs in "local-only" mode: no sign-in, data stays in this browser.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isAuthConfigured = Boolean(url && anon)

export const supabase: SupabaseClient | null = isAuthConfigured ? createClient(url!, anon!) : null

/**
 * Where supabase-js keeps the signed-in session on this device (its default
 * key naming). Read directly when the auth server can't be reached, so an
 * outage doesn't lock someone out of data that's already on their phone.
 */
export const authStorageKey: string | null = (() => {
  try {
    return isAuthConfigured ? `sb-${new URL(url!).hostname.split('.')[0]}-auth-token` : null
  } catch {
    return null
  }
})()
