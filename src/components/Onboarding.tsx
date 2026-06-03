import { useState } from 'react'
import { useStore } from '../state/store'
import { Button, Card, Toggle } from './ui'
import { MEDICAL_DISCLAIMER } from '../data/safety'

type Role = 'patient' | 'caregiver'

export function Onboarding() {
  const { updateProfile } = useStore()
  const [role, setRole] = useState<Role | null>(null)
  const [name, setName] = useState('')
  const [surgeryDate, setSurgeryDate] = useState('')
  const [cleared, setCleared] = useState(false)
  const [sternal, setSternal] = useState(false)
  const [rehab, setRehab] = useState(false)

  const Header = (
    <div className="mb-6 text-center">
      <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-700 text-3xl">❤️</div>
      <h1 className="text-3xl font-extrabold text-slate-900">Welcome to HeartStrong</h1>
    </div>
  )

  // Step 1 — choose role
  if (role === null) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        {Header}
        <p className="mb-6 text-center text-lg text-slate-600">How will you use HeartStrong?</p>
        <div className="space-y-3">
          <button
            onClick={() => setRole('patient')}
            className="flex w-full items-start gap-4 rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-slate-200 hover:ring-brand-400"
          >
            <span className="text-3xl" aria-hidden>🏃</span>
            <span>
              <span className="block text-lg font-bold text-slate-900">For my own heart recovery</span>
              <span className="mt-0.5 block text-base text-slate-600">
                Get a safe daily workout built around your surgery, medications, and equipment.
              </span>
            </span>
          </button>
          <button
            onClick={() => setRole('caregiver')}
            className="flex w-full items-start gap-4 rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-slate-200 hover:ring-brand-400"
          >
            <span className="text-3xl" aria-hidden>💙</span>
            <span>
              <span className="block text-lg font-bold text-slate-900">To support a loved one</span>
              <span className="mt-0.5 block text-base text-slate-600">
                Follow someone’s progress with a share code. No workout plan — just their streak, workouts, and notes.
              </span>
            </span>
          </button>
        </div>
      </div>
    )
  }

  // Step 2a — caregiver: just a name
  if (role === 'caregiver') {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        {Header}
        <Card className="space-y-5 p-5">
          <label className="block">
            <span className="text-base font-semibold text-slate-800">What’s your name?</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="First name"
              className="mt-2 w-full rounded-xl border-0 bg-slate-100 px-4 py-3 text-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-brand-500"
            />
          </label>
          <p className="text-sm text-slate-500">Next, you’ll enter a share code from the person you’re supporting.</p>
        </Card>
        <div className="mt-5 flex gap-2">
          <Button variant="ghost" onClick={() => setRole(null)}>
            Back
          </Button>
          <Button full onClick={() => updateProfile({ role: 'caregiver', name: name.trim() || 'Friend', onboarded: true })}>
            Continue
          </Button>
        </div>
      </div>
    )
  }

  // Step 2b — patient details
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      {Header}
      <p className="mb-5 text-center text-lg text-slate-600">A few details so we can keep your workouts safe.</p>
      <Card className="space-y-5 p-5">
        <label className="block">
          <span className="text-base font-semibold text-slate-800">What should we call you?</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First name"
            className="mt-2 w-full rounded-xl border-0 bg-slate-100 px-4 py-3 text-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-brand-500"
          />
        </label>

        <label className="block">
          <span className="text-base font-semibold text-slate-800">When was your bypass surgery?</span>
          <span className="mt-0.5 block text-sm text-slate-500">This sets a safe starting point. You can change it later.</span>
          <input
            type="date"
            value={surgeryDate}
            onChange={(e) => setSurgeryDate(e.target.value)}
            className="mt-2 w-full rounded-xl border-0 bg-slate-100 px-4 py-3 text-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-brand-500"
          />
        </label>

        <div className="space-y-2.5">
          <Toggle checked={cleared} onChange={setCleared} label="My cardiologist has cleared me to exercise" description="If not yet, that’s okay — we’ll keep to gentle walking until you are." />
          <Toggle checked={sternal} onChange={setSternal} label="My surgeon lifted my breastbone (sternal) precautions" description="Usually around 6–8 weeks. Until then we keep load off the arms and chest." />
          <Toggle checked={rehab} onChange={setRehab} label="I’m in (or finished) a cardiac rehab program" description="Supervised cardiac rehab is strongly recommended after bypass surgery." />
        </div>
      </Card>

      <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 ring-1 ring-amber-200">{MEDICAL_DISCLAIMER}</div>

      <div className="mt-5 flex gap-2">
        <Button variant="ghost" onClick={() => setRole(null)}>
          Back
        </Button>
        <Button
          full
          className="!py-4 !text-lg"
          onClick={() =>
            updateProfile({
              role: 'patient',
              name: name.trim() || 'Friend',
              surgeryDate: surgeryDate || null,
              clearedForExercise: cleared,
              sternalPrecautionsLifted: sternal,
              inCardiacRehab: rehab,
              onboarded: true,
            })
          }
        >
          Let’s get started
        </Button>
      </div>
    </div>
  )
}
