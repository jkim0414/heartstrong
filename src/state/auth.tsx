import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { authStorageKey, isAuthConfigured, supabase } from '../lib/supabase'

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

/**
 * The account whose session is stored on this device, if any. supabase-js
 * keeps the stored session through network failures and removes it only on a
 * real sign-out or a rejected refresh — so its presence means "this person is
 * signed in here", even when the server can't confirm it right now.
 */
function readStoredUser(): AuthUser | null {
  try {
    const raw = authStorageKey ? localStorage.getItem(authStorageKey) : null
    const u = raw ? (JSON.parse(raw) as { user?: { id?: string; email?: string } }).user : null
    return u?.id ? { id: u.id, email: u.email ?? null } : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Start from the stored session: no network round-trip before the app
  // appears, and no lock-out when the auth server is unreachable (the client
  // would otherwise retry for ~30s and then report "no session").
  const [user, setUser] = useState<AuthUser | null>(() => (isAuthConfigured ? readStoredUser() : null))
  const [status, setStatus] = useState<AuthStatus>(() => (!isAuthConfigured ? 'local' : readStoredUser() ? 'signedIn' : 'loading'))

  useEffect(() => {
    if (!supabase) return // local mode, nothing to do
    let active = true

    const apply = (session: { user: { id: string; email?: string | null } } | null) => {
      if (!active) return
      if (session) {
        setUser({ id: session.user.id, email: session.user.email ?? null })
        setStatus('signedIn')
        return
      }
      // No live session. If one is still stored, the server just couldn't be
      // reached — stay signed in and let the app run from its local copy.
      const stored = readStoredUser()
      setUser(stored)
      setStatus(stored ? 'signedIn' : 'signedOut')
    }

    supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session))
      .catch(() => apply(null))

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => apply(session))

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
        // Give the server a moment to revoke this session (the normal case),
        // but never wait on it: when it's unreachable the client retries a
        // token refresh for ~30s first, and signing out of this device must
        // always work.
        if (supabase) {
          const revoke = supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
          await Promise.race([revoke, new Promise((resolve) => setTimeout(resolve, 2500))])
        }
        try {
          if (authStorageKey) localStorage.removeItem(authStorageKey)
        } catch {
          /* non-fatal */
        }
        setUser(null)
        setStatus('signedOut')
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

/**
 * Current access token for authorizing API calls (or null). Bounded: when the
 * auth server is down the client retries a token refresh for ~30s, and callers
 * (the workout planner) shouldn't hang on that.
 */
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null
  try {
    const session = supabase.auth.getSession().then(({ data }) => data.session?.access_token ?? null)
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))
    return await Promise.race([session, timeout])
  } catch {
    return null
  }
}
