// Health check + keep-alive (Vercel-style: /api/health).
//
// Two jobs:
//  1. Diagnosis — one URL that says whether the account backend is reachable.
//     When it isn't, sign-in and sync fail for everyone, and nothing else in
//     the app makes that obvious to whoever maintains it.
//  2. Keep-alive — Supabase pauses free-tier projects after a stretch of
//     inactivity (their hostname then stops resolving entirely). vercel.json
//     schedules a daily call here; the requests below are that activity.
//
// Exposes no data: only reachability booleans.

async function reachable(url: string, headers: Record<string, string>): Promise<boolean> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const r = await fetch(url, { headers, signal: ctrl.signal })
    // Any answer from the service (even 401/403) proves it is up and resolving.
    return r.status < 500
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(_req: any, res: any) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

  let accounts: 'ok' | 'unreachable' | 'not-configured' = 'not-configured'
  if (supabaseUrl && anon) {
    const headers = { apikey: anon, authorization: `Bearer ${anon}` }
    const [auth, db] = await Promise.all([
      reachable(`${supabaseUrl}/auth/v1/health`, headers),
      // A real (tiny) database round-trip; row-level security returns nothing.
      reachable(`${supabaseUrl}/rest/v1/app_state?select=user_id&limit=1`, headers),
    ])
    accounts = auth && db ? 'ok' : 'unreachable'
  }

  const ok = accounts !== 'unreachable'
  res.setHeader('cache-control', 'no-store')
  res.status(ok ? 200 : 503).json({
    ok,
    accounts,
    ai: process.env.ANTHROPIC_API_KEY ? 'configured' : 'not-configured',
    checkedAt: new Date().toISOString(),
  })
}
