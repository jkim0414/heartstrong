import { useState } from 'react'
import { STOP_SIGNS, STOP_ACTION, RPE_SCALE, RPE_EXPLAINER, MED_REMINDERS, MEDICAL_DISCLAIMER } from '../data/safety'
import type { Profile } from '../types'
import { Button } from './ui'

/** A full-screen, always-reachable safety reference. */
export function SafetySheet({ onClose, profile }: { onClose: () => void; profile: Profile }) {
  const hasHealthProfile = !!(profile.conditions || profile.medications || profile.careNotes)
  const [tab, setTab] = useState<'stop' | 'effort' | 'reminders'>('stop')
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/40 backdrop-blur-sm">
      <div className="mt-auto flex max-h-[92vh] flex-col rounded-t-3xl bg-slate-50 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-xl font-bold text-slate-900">Safety</h2>
          <button onClick={onClose} className="rounded-full bg-slate-200 px-4 py-2 text-base font-semibold text-slate-700">
            Close
          </button>
        </div>

        <div className="flex gap-2 px-4 pt-4">
          {([
            ['stop', 'Warning signs'],
            ['effort', 'How hard?'],
            ['reminders', 'Reminders'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${tab === id ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {tab === 'stop' && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200">
                <p className="text-base font-bold text-rose-900">Stop exercising right away if you notice:</p>
                <ul className="mt-3 space-y-2">
                  {STOP_SIGNS.map((s) => (
                    <li key={s} className="flex gap-2 text-base text-rose-900">
                      <span aria-hidden>🛑</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <p className="text-base font-semibold text-slate-800">What to do</p>
                <p className="mt-2 text-base text-slate-600">{STOP_ACTION}</p>
              </div>
              <a
                href="tel:911"
                className="flex w-full items-center justify-center rounded-xl bg-rose-600 px-5 py-4 text-lg font-bold text-white"
              >
                Call 911
              </a>
            </div>
          )}

          {tab === 'effort' && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
                <p className="text-base font-semibold text-amber-900">Why we don’t use heart rate</p>
                <p className="mt-2 text-base text-amber-900">{RPE_EXPLAINER}</p>
              </div>
              <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
                {RPE_SCALE.filter((r) => r.rpe >= 1 && r.rpe <= 9).map((r) => (
                  <div key={r.rpe} className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">
                      {r.rpe}
                    </span>
                    <span className="w-28 shrink-0 text-sm font-semibold text-slate-800">{r.label}</span>
                    <span className="text-sm text-slate-500">{r.talk}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'reminders' && (
            <div className="space-y-3">
              {/* Personalized from the user's own health profile (Settings). */}
              {hasHealthProfile ? (
                <div className="rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-200">
                  <p className="text-base font-semibold text-brand-900">Your health profile</p>
                  <div className="mt-3 space-y-3">
                    {profile.conditions && <ProfileLine label="Conditions" text={profile.conditions} />}
                    {profile.medications && <ProfileLine label="Medications" text={profile.medications} />}
                    {profile.careNotes && <ProfileLine label="Care-team notes / things to avoid" text={profile.careNotes} />}
                  </div>
                  <p className="mt-3 text-xs text-brand-800/80">Edit anytime in Settings → Health profile.</p>
                </div>
              ) : (
                <div className="rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-200">
                  <p className="text-base font-semibold text-brand-900">Personalize these reminders</p>
                  <p className="mt-1.5 text-sm text-brand-800">
                    Add your conditions, medications, and any care-team notes in Settings → Health profile, and they’ll show
                    up here as a quick reference.
                  </p>
                </div>
              )}

              <p className="px-1 pt-1 text-sm font-bold uppercase tracking-wide text-slate-500">General reminders</p>
              {MED_REMINDERS.map((r) => (
                <div key={r.title} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <p className="text-base font-semibold text-slate-800">{r.title}</p>
                  <p className="mt-1.5 text-base text-slate-600">{r.body}</p>
                </div>
              ))}
            </div>
          )}

          <p className="px-1 pb-2 text-xs leading-relaxed text-slate-400">{MEDICAL_DISCLAIMER}</p>
        </div>
      </div>
    </div>
  )
}

/** A labelled free-text line from the user's health profile. */
function ProfileLine({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-base text-slate-700">{text}</p>
    </div>
  )
}

/** Small red button used in the header to open the safety sheet. */
export function SafetyButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="danger" onClick={onClick} className="!px-3 !py-2 !text-sm">
      ⚠ Warning signs
    </Button>
  )
}
