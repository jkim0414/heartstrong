import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Read from Vite env. When unset (local dev or a static deploy with no backend),
// the app runs in "local-only" mode: no sign-in, data stays in this browser.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isAuthConfigured = Boolean(url && anon)

export const supabase: SupabaseClient | null = isAuthConfigured ? createClient(url!, anon!) : null
