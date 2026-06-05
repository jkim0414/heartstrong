import { useState } from 'react'
import { useStore } from '../state/store'
import { useAuth } from '../state/auth'
import { Button, Card, SectionTitle, Toggle } from './ui'
import { CareSection } from './CareSection'
import { PHASES } from '../data/phases'
import type { PhaseId } from '../types'

export function Settings() {
  const { state, updateProfile, resetAll, importLocalData, hasLegacyData } = useStore()
  const auth = useAuth()
  const p = state.profile
  const [confirmReset, setConfirmReset] = useState(false)
  const [imported, setImported] = useState(false)

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-slate-900">Settings</h1>

      <SectionTitle>How you use HeartStrong</SectionTitle>
      <Card className="space-y-3 p-5">
        <p className="text-sm text-slate-600">
          You’re set up for <span className="font-semibold">your own workouts</span>. If you’re really here to support
          someone else, switch to caregiver mode — it swaps the workout plan for a view of the people you follow.
        </p>
        <Button variant="secondary" className="!text-sm" onClick={() => updateProfile({ role: 'caregiver' })}>
          Switch to caregiver mode
        </Button>
      </Card>

      {auth.configured && auth.status === 'signedIn' && (
        <>
          <SectionTitle>Account</SectionTitle>
          <Card className="space-y-3 p-5">
            <p className="text-base text-slate-700">
              Signed in as <span className="font-semibold">{auth.user?.email ?? 'your account'}</span>
            </p>
            <p className="text-sm text-slate-500">Your workouts and history sync securely across your devices.</p>
            {hasLegacyData && (
              <Button
                variant="secondary"
                className="!text-sm"
                disabled={imported}
                onClick={() => {
                  importLocalData()
                  setImported(true)
                }}
              >
                {imported ? '✓ Imported this device’s data' : 'Import data already on this device'}
              </Button>
            )}
            <Button variant="ghost" className="!text-sm" onClick={() => auth.signOut()}>
              Sign out
            </Button>
          </Card>

          <CareSection />
        </>
      )}

      <SectionTitle>About you</SectionTitle>
      <Card className="space-y-4 p-5">
        <label className="block">
          <span className="text-base font-semibold text-slate-800">Name</span>
          <input
            value={p.name}
            onChange={(e) => updateProfile({ name: e.target.value })}
            className="mt-2 w-full rounded-xl border-0 bg-slate-100 px-4 py-3 text-base ring-1 ring-slate-200 focus:ring-2 focus:ring-brand-500"
          />
        </label>
        <label className="block">
          <span className="text-base font-semibold text-slate-800">Bypass surgery date</span>
          <input
            type="date"
            value={p.surgeryDate ?? ''}
            onChange={(e) => updateProfile({ surgeryDate: e.target.value || null })}
            className="mt-2 w-full rounded-xl border-0 bg-slate-100 px-4 py-3 text-base ring-1 ring-slate-200 focus:ring-2 focus:ring-brand-500"
          />
        </label>
      </Card>

      <SectionTitle>Medical clearance</SectionTitle>
      <div className="space-y-2.5">
        <Toggle
          checked={p.clearedForExercise}
          onChange={(v) => updateProfile({ clearedForExercise: v })}
          label="Cleared to exercise by my cardiologist"
        />
        <Toggle
          checked={p.sternalPrecautionsLifted}
          onChange={(v) => updateProfile({ sternalPrecautionsLifted: v })}
          label="Sternal (breastbone) precautions lifted"
          description="Unlocks light resistance training and upper-body work."
        />
        <Toggle
          checked={p.inCardiacRehab}
          onChange={(v) => updateProfile({ inCardiacRehab: v })}
          label="In or completed cardiac rehab"
        />
      </div>

      <SectionTitle>Health profile (optional)</SectionTitle>
      <Card className="space-y-4 p-5">
        <p className="text-sm text-slate-600">
          Adding your conditions, medications, and any guidance from your care team helps the workout coach stay aware
          of your situation. It’s shown as reminders and given to the AI as background — it’s <span className="font-semibold">not</span> medical
          advice, and the safety limits stay the same regardless.
        </p>
        <HealthField label="Conditions" placeholder="e.g. bypass surgery May 2026, type 2 diabetes, high blood pressure, CKD…" value={p.conditions ?? ''} onSave={(v) => updateProfile({ conditions: v })} />
        <HealthField label="Current medications" placeholder="e.g. aspirin, clopidogrel, metoprolol, atorvastatin, nitroglycerin as needed…" value={p.medications ?? ''} onSave={(v) => updateProfile({ medications: v })} />
        <HealthField label="Notes from my care team / things to avoid" placeholder="e.g. in cardiac rehab; keep breastbone precautions until surgeon clears; carries nitroglycerin…" value={p.careNotes ?? ''} onSave={(v) => updateProfile({ careNotes: v })} />
      </Card>

      <SectionTitle>Workout generation</SectionTitle>
      <div className="space-y-2.5">
        <Toggle
          checked={p.aiEnabled}
          onChange={(v) => updateProfile({ aiEnabled: v })}
          label="AI-generated workouts"
          description="Fresh, constantly-varied sessions each day. Needs an internet connection; falls back to the built-in plan when offline. Every AI workout is safety-checked against your phase and precautions before it’s shown."
        />
      </div>
      {p.aiEnabled && (
        <Card className="p-4">
          <p className="text-sm text-slate-600">
            ✨ Tap <span className="font-semibold">“New variation”</span> on the Today screen anytime you want a
            different workout. The same safety rules always apply — chest-loading and high-intensity work stay locked to
            your current phase no matter what the AI suggests.
          </p>
        </Card>
      )}

      <SectionTitle>Training phase</SectionTitle>
      <Card className="p-5">
        <p className="text-sm text-slate-600">
          By default your phase is chosen automatically from your surgery date and clearances — the safe option. You can
          override it, but please don’t move ahead of what your care team advises.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => updateProfile({ phaseOverride: null })}
            className={`rounded-xl px-3 py-3 text-sm font-semibold ring-1 ${p.phaseOverride == null ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-700 ring-slate-200'}`}
          >
            Automatic
          </button>
          {([1, 2, 3, 4] as PhaseId[]).map((ph) => (
            <button
              key={ph}
              onClick={() => updateProfile({ phaseOverride: ph })}
              className={`rounded-xl px-3 py-3 text-sm font-semibold ring-1 ${p.phaseOverride === ph ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-700 ring-slate-200'}`}
            >
              {PHASES[ph].name}
            </button>
          ))}
        </div>
        {p.phaseOverride != null && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            ⚠ Manual phase is on. Note: chest-loading movements still stay locked until you mark sternal precautions
            lifted above — that guardrail can’t be overridden.
          </p>
        )}
      </Card>

      <SectionTitle>Data</SectionTitle>
      <Card className="p-5">
        <p className="text-sm text-slate-600">
          Everything is stored privately on this device only — nothing is sent anywhere. Clearing data removes your
          history and starts fresh.
        </p>
        {!confirmReset ? (
          <Button variant="secondary" className="mt-3 !text-rose-700 !ring-rose-200" onClick={() => setConfirmReset(true)}>
            Clear all data
          </Button>
        ) : (
          <div className="mt-3 flex gap-2">
            <Button variant="danger" onClick={resetAll}>
              Yes, erase everything
            </Button>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
          </div>
        )}
      </Card>

      <p className="px-1 pb-2 text-center text-xs text-slate-400">HeartStrong · built with care ❤️</p>
    </div>
  )
}

function HealthField({ label, placeholder, value, onSave }: { label: string; placeholder: string; value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  return (
    <label className="block">
      <span className="text-base font-semibold text-slate-800">{label}</span>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onSave(draft.trim())}
        rows={3}
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl border-0 bg-slate-100 px-4 py-3 text-base ring-1 ring-slate-200 focus:ring-2 focus:ring-brand-500"
      />
    </label>
  )
}
