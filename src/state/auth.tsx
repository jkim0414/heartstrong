import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isAuthConfigured, supabase } from '../lib/supabase'

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'local'

export interface AuthUser {
  id: string
  email: string | null
}

interface Auth {
  status: AuthStatus
  user: AuthUser | null
  /** Whether a backend (Supabase) is configured at all. */
  configured: boolean
  /** Send a passwordless magic-link to this email. */
  signInWithEmail: (email: string) => Promise<{ error: string | null }>
  signInWithGoogle: () => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<Auth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(isAuthConfigured ? 'loading' : 'local')
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    if (!supabase) return // local mode, nothing to do
    let active = true

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return
        const s = data.session
        setUser(s ? { id: s.user.id, email: s.user.email ?? null } : null)
        setStatus(s ? 'signedIn' : 'signedOut')
      })
      .catch(() => {
        // Don't get stuck on the splash if the session check fails.
        if (active) setStatus('signedOut')
      })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session ? { id: session.user.id, email: session.user.email ?? null } : null)
      setStatus(session ? 'signedIn' : 'signedOut')
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<Auth>(
    () => ({
      status,
      user,
      configured: isAuthConfigured,
      signInWithEmail: async (email) => {
        if (!supabase) return { error: 'Sign-in is not configured.' }
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: window.location.origin },
        })
        return { error: error?.message ?? null }
      },
      signInWithGoogle: async () => {
        if (!supabase) return { error: 'Sign-in is not configured.' }
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin },
        })
        return { error: error?.message ?? null }
      },
      signOut: async () => {
        await supabase?.auth.signOut()
      },
    }),
    [status, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

/** Current access token for authorizing API calls (or null). */
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}
