import { useState } from 'react'
import { useStore } from './state/store'
import { Onboarding } from './components/Onboarding'
import { Today } from './components/Today'
import { History } from './components/History'
import { Progress } from './components/Progress'
import { Equipment } from './components/Equipment'
import { Settings } from './components/Settings'
import { SafetySheet, SafetyButton } from './components/SafetySheet'
import { SignIn } from './components/SignIn'
import { useAuth } from './state/auth'

type Tab = 'today' | 'history' | 'progress' | 'equipment' | 'settings'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: '🏠' },
  { id: 'history', label: 'History', icon: '📅' },
  { id: 'progress', label: 'Progress', icon: '📈' },
  { id: 'equipment', label: 'Equipment', icon: '🏋️' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

export function App() {
  const { state } = useStore()
  const auth = useAuth()
  const [tab, setTab] = useState<Tab>('today')
  const [safetyOpen, setSafetyOpen] = useState(false)

  // When a backend is configured, require sign-in before anything else.
  if (auth.configured && auth.status === 'signedOut') {
    return (
      <div className="min-h-full bg-slate-100">
        <SignIn />
      </div>
    )
  }

  if (!state.profile.onboarded) {
    return (
      <div className="min-h-full bg-slate-100">
        <Onboarding />
      </div>
    )
  }

  return (
    <div className="min-h-full bg-slate-100">
      {/* Header */}
      <header className="safe-top sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden>❤️</span>
            <span className="text-lg font-extrabold tracking-tight text-brand-800">HeartStrong</span>
          </div>
          <SafetyButton onClick={() => setSafetyOpen(true)} />
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-2xl px-4 pb-28 pt-5">
        {tab === 'today' && <Today />}
        {tab === 'history' && <History />}
        {tab === 'progress' && <Progress />}
        {tab === 'equipment' && <Equipment />}
        {tab === 'settings' && <Settings />}
      </main>

      {/* Bottom navigation */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-semibold transition ${
                tab === t.id ? 'text-brand-700' : 'text-slate-400'
              }`}
            >
              <span className={`text-2xl ${tab === t.id ? '' : 'grayscale'}`} aria-hidden>
                {t.icon}
              </span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {safetyOpen && <SafetySheet onClose={() => setSafetyOpen(false)} />}
    </div>
  )
}
