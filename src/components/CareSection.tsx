import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { Button, Card, SectionTitle } from './ui'
import { CaregiverView } from './CaregiverView'
import {
  createShareCode,
  listShares,
  revokeShare,
  followByCode,
  listFollows,
  unfollow,
  type ShareLink,
  type Follow,
} from '../lib/care'

export function CareSection() {
  const { state } = useStore()
  const [shares, setShares] = useState<ShareLink[]>([])
  const [follows, setFollows] = useState<Follow[]>([])
  const [codeInput, setCodeInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<{ patientId: string; label: string } | null>(null)

  const refresh = () => {
    listShares().then(setShares).catch(() => {})
    listFollows().then(setFollows).catch(() => {})
  }
  useEffect(refresh, [])

  const create = async () => {
    setBusy(true)
    try {
      await createShareCode(state.profile.name || 'Me')
      refresh()
    } finally {
      setBusy(false)
    }
  }

  const follow = async () => {
    if (!codeInput.trim()) return
    setBusy(true)
    setError(null)
    try {
      await followByCode(codeInput)
      setCodeInput('')
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not follow that code')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SectionTitle>Share my progress</SectionTitle>
      <Card className="space-y-3 p-5">
        <p className="text-sm text-slate-600">
          Create a code and share it with a family member so they can follow your workouts and streak (read-only). You
          can revoke it anytime.
        </p>
        {shares.length > 0 && (
          <div className="space-y-2">
            {shares.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                <div>
                  <span className="font-mono text-lg font-bold tracking-widest text-slate-900">{s.code}</span>
                  <span className="ml-2 text-sm text-slate-500">{s.caregiver_id ? 'in use' : 'not yet used'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigator.clipboard?.writeText(s.code)}
                    className="rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-700 ring-1 ring-brand-200"
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => revokeShare(s.id).then(refresh)}
                    className="rounded-lg px-3 py-1.5 text-sm font-semibold text-rose-600 ring-1 ring-rose-200"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <Button variant="secondary" className="!text-sm" disabled={busy} onClick={create}>
          + Create a share code
        </Button>
      </Card>

      <SectionTitle>Follow someone</SectionTitle>
      <Card className="space-y-3 p-5">
        <p className="text-sm text-slate-600">Enter a code someone shared with you to follow their progress.</p>
        <div className="flex gap-2">
          <input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && follow()}
            placeholder="CODE"
            className="w-40 rounded-xl border-0 bg-slate-100 px-4 py-3 text-lg font-mono uppercase tracking-widest ring-1 ring-slate-200 focus:ring-2 focus:ring-brand-500"
          />
          <Button variant="secondary" disabled={busy || !codeInput.trim()} onClick={follow}>
            Follow
          </Button>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}

        {follows.length > 0 && (
          <div className="space-y-2 pt-1">
            {follows.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200">
                <button onClick={() => setViewing({ patientId: f.patient_id, label: f.patient_label ?? 'Their progress' })} className="flex-1 text-left">
                  <span className="text-base font-semibold text-slate-900">{f.patient_label ?? 'Their progress'}</span>
                  <span className="ml-2 text-sm font-medium text-brand-700">View →</span>
                </button>
                <button
                  onClick={() => unfollow(f.id).then(refresh)}
                  className="text-sm font-semibold text-slate-400 hover:text-rose-500"
                >
                  Unfollow
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {viewing && <CaregiverView patientId={viewing.patientId} label={viewing.label} onClose={() => setViewing(null)} />}
    </>
  )
}
