// Sanity-check your configuration. Run with:  npm run check
import { readEnv } from './env.mjs'

const env = readEnv()
const checks = []
const ok = (label, pass, hint) => checks.push({ label, pass, hint })

const url = env.VITE_SUPABASE_URL
const anon = env.VITE_SUPABASE_ANON_KEY

ok('ANTHROPIC_API_KEY set', !!env.ANTHROPIC_API_KEY, 'Needed for AI workouts (serverless function).')
ok('VITE_SUPABASE_URL set', !!url, 'Supabase → Settings → API → Project URL.')
ok('VITE_SUPABASE_ANON_KEY set', !!anon, 'Supabase → Settings → API → anon public key.')
ok('SUPABASE_URL set (for the function)', !!env.SUPABASE_URL, 'Same value as VITE_SUPABASE_URL.')

if (url) {
  try {
    const r = await fetch(`${url}/auth/v1/health`, { headers: anon ? { apikey: anon } : {} })
    ok('Supabase reachable', r.ok, `GET /auth/v1/health returned ${r.status}.`)
  } catch (e) {
    ok('Supabase reachable', false, e.message)
  }
}

let allPass = true
console.log('')
for (const c of checks) {
  console.log(`${c.pass ? '✓' : '✗'} ${c.label}${c.pass ? '' : `  — ${c.hint}`}`)
  if (!c.pass) allPass = false
}
console.log(
  allPass
    ? '\nAll set. Run `npm run migrate` (if you haven’t), then `vercel dev`.\n'
    : '\nFill in the missing values in .env.local, then run `npm run check` again.\n',
)
process.exit(allPass ? 0 : 1)
