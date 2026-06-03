import { useState } from 'react'
import { useAuth } from '../state/auth'
import { Button, Card } from './ui'

export function SignIn() {
  const { signInWithEmail, signInWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendLink = async () => {
    if (!email.trim()) return
    setBusy(true)
    setError(null)
    const { error } = await signInWithEmail(email)
    setBusy(false)
    if (error) setError(error)
    else setSent(true)
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-700 text-3xl">❤️</div>
        <h1 className="text-3xl font-extrabold text-slate-900">HeartStrong</h1>
        <p className="mt-2 text-base text-slate-600">Sign in to pick up your workouts on any device.</p>
      </div>

      {sent ? (
        <Card className="p-6 text-center">
          <p className="text-4xl">📬</p>
          <p className="mt-2 text-lg font-bold text-slate-900">Check your email</p>
          <p className="mt-1 text-base text-slate-600">
            We sent a sign-in link to <span className="font-semibold">{email}</span>. Open it on this device to continue —
            no password needed.
          </p>
          <button onClick={() => setSent(false)} className="mt-4 text-sm font-semibold text-brand-700">
            Use a different email
          </button>
        </Card>
      ) : (
        <Card className="space-y-4 p-6">
          <label className="block">
            <span className="text-base font-semibold text-slate-800">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendLink()}
              placeholder="you@example.com"
              autoComplete="email"
              className="mt-2 w-full rounded-xl border-0 bg-slate-100 px-4 py-3 text-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-brand-500"
            />
          </label>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <Button full className="!py-4 !text-lg" disabled={busy || !email.trim()} onClick={sendLink}>
            {busy ? 'Sending…' : 'Email me a sign-in link'}
          </Button>

          {import.meta.env.VITE_ENABLE_GOOGLE === 'true' && (
            <>
              <div className="flex items-center gap-3 text-sm text-slate-400">
                <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
              </div>
              <Button variant="secondary" full onClick={() => signInWithGoogle()}>
                Continue with Google
              </Button>
            </>
          )}
        </Card>
      )}

      <p className="mt-5 px-2 text-center text-xs leading-relaxed text-slate-400">
        Your workouts and health details are private to your account and synced securely so you can use HeartStrong on
        any device. We only use your email to sign you in.
      </p>
    </div>
  )
}
