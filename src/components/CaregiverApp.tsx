import { useStore } from '../state/store'
import { useAuth } from '../state/auth'
import { Card, Button } from './ui'
import { FollowPeople } from './CareSection'

export function CaregiverApp() {
  const { state, updateProfile } = useStore()
  const auth = useAuth()
  const name = state.profile.name

  return (
    <div className="min-h-full bg-slate-100">
      <header className="safe-top sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden>❤️</span>
            <span className="text-lg font-extrabold tracking-tight text-brand-800">HeartStrong</span>
          </div>
          <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700">Caregiver</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 pb-16 pt-5">
        <div>
          <p className="text-base font-medium text-slate-500">{name ? `Hi ${name},` : 'Welcome,'}</p>
          <h1 className="text-2xl font-extrabold text-slate-900">Who are you supporting?</h1>
          <p className="mt-1 text-base text-slate-600">
            Follow a loved one with the share code from their HeartStrong app to see how they’re doing.
          </p>
        </div>

        <FollowPeople heading={false} />

        <Card className="space-y-3 p-5">
          <p className="text-base text-slate-700">
            Signed in as <span className="font-semibold">{auth.user?.email ?? 'your account'}</span>
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="secondary" className="!text-sm" onClick={() => updateProfile({ role: 'patient' })}>
              Switch to my own workouts
            </Button>
            <Button variant="ghost" className="!text-sm" onClick={() => auth.signOut()}>
              Sign out
            </Button>
          </div>
        </Card>

        <p className="px-1 text-center text-xs text-slate-400">
          You can see streaks, workouts, and notes the person chooses to share — you can’t change their plan.
        </p>
      </main>
    </div>
  )
}
