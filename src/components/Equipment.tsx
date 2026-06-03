import { useState } from 'react'
import { useStore } from '../state/store'
import { Button, Card, SectionTitle, Toggle } from './ui'
import { EQUIPMENT_CATALOG, CATALOG_BY_ID } from '../data/equipment'
import type { EquipmentItem } from '../types'

export function Equipment() {
  const { state, updateEquipment } = useStore()
  const eq = state.equipment
  const [customName, setCustomName] = useState('')

  const setItem = (id: string, patch: Partial<EquipmentItem>) =>
    updateEquipment(eq.map((e) => (e.id === id ? { ...e, ...patch } : e)))

  const removeItem = (id: string) => updateEquipment(eq.filter((e) => e.id !== id))

  const addCatalog = (catId: string) => {
    const c = CATALOG_BY_ID[catId]
    if (!c || eq.some((e) => e.id === catId)) return
    updateEquipment([
      ...eq,
      { id: c.id, label: c.label, owned: true, weightsLb: c.loadable ? c.defaultWeightsLb : undefined },
    ])
  }

  const addCustom = () => {
    const label = customName.trim()
    if (!label) return
    let id = 'custom-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    let n = 1
    while (eq.some((e) => e.id === id)) id = `${id}-${++n}`
    updateEquipment([...eq, { id, label, owned: true, custom: true }])
    setCustomName('')
  }

  const present = new Set(eq.map((e) => e.id))
  const addable = EQUIPMENT_CATALOG.filter((c) => !present.has(c.id))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">My equipment</h1>
        <p className="mt-1 text-base text-slate-600">
          Workouts are built only from what you have. Add gear as you get it — the plan adapts automatically.
        </p>
      </div>

      <SectionTitle>What you have</SectionTitle>
      <div className="space-y-2.5">
        {eq.map((item) => {
          const loadable = !!CATALOG_BY_ID[item.id]?.loadable || item.weightsLb !== undefined
          return (
            <div key={item.id}>
              <div className="flex items-stretch gap-2">
                <div className="flex-1">
                  <Toggle
                    checked={item.owned}
                    onChange={(v) => !item.fixed && setItem(item.id, { owned: v })}
                    label={item.label}
                    description={item.fixed ? 'Always available' : item.custom ? 'Custom (used by AI workouts)' : undefined}
                  />
                </div>
                {!item.fixed && (
                  <button
                    onClick={() => removeItem(item.id)}
                    className="shrink-0 rounded-xl px-3 text-slate-400 ring-1 ring-slate-200 hover:bg-rose-50 hover:text-rose-500"
                    aria-label={`Remove ${item.label}`}
                  >
                    ✕
                  </button>
                )}
              </div>
              {loadable && item.owned && (
                <WeightEditor item={item} onChange={(weights) => setItem(item.id, { weightsLb: weights })} />
              )}
            </div>
          )
        })}
      </div>

      {addable.length > 0 && (
        <>
          <SectionTitle>Add equipment</SectionTitle>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {addable.map((c) => (
              <button
                key={c.id}
                onClick={() => addCatalog(c.id)}
                className="flex items-start gap-3 rounded-2xl bg-white p-4 text-left ring-1 ring-slate-200 hover:ring-brand-300"
              >
                <span className="text-xl font-bold text-brand-700">＋</span>
                <span>
                  <span className="block text-base font-semibold text-slate-800">{c.label}</span>
                  <span className="mt-0.5 block text-sm text-slate-500">{c.blurb}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <SectionTitle>Add your own</SectionTitle>
      <Card className="p-4">
        <p className="text-sm text-slate-600">Got something not listed? Add it and the AI workouts will use it.</p>
        <div className="mt-3 flex gap-2">
          <input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustom()}
            placeholder="e.g. sandbag, sled, rings"
            className="flex-1 rounded-xl border-0 bg-slate-100 px-4 py-3 text-base ring-1 ring-slate-200 focus:ring-2 focus:ring-brand-500"
          />
          <Button variant="secondary" onClick={addCustom}>
            Add
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <p className="text-sm text-slate-600">
          💡 As you get stronger, heavier loads are the single best upgrade — they’re what keep the strength work
          challenging. Add the weights to any item above and the app programs them in.
        </p>
      </Card>
    </div>
  )
}

function WeightEditor({ item, onChange }: { item: EquipmentItem; onChange: (weights: number[]) => void }) {
  const [val, setVal] = useState('')
  const weights = item.weightsLb ?? []
  const loadable = CATALOG_BY_ID[item.id]
  const noun = item.id === 'dumbbells' ? 'pairs' : 'weights'

  const add = () => {
    const n = parseInt(val, 10)
    if (!Number.isFinite(n) || n <= 0 || weights.includes(n)) {
      setVal('')
      return
    }
    onChange([...weights, n].sort((a, b) => a - b))
    setVal('')
  }

  return (
    <div className="mt-1 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
      <p className="text-sm font-semibold text-slate-700">
        {loadable?.label ?? item.label} {noun} you own (lb)
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {weights.map((w) => (
          <span key={w} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
            {w} lb
            <button onClick={() => onChange(weights.filter((x) => x !== w))} className="text-slate-400 hover:text-rose-500" aria-label={`Remove ${w} lb`}>
              ✕
            </button>
          </span>
        ))}
        {weights.length === 0 && <span className="text-sm text-slate-400">None added yet</span>}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          inputMode="numeric"
          placeholder="e.g. 40"
          className="w-28 rounded-lg border-0 bg-white px-3 py-2 text-base ring-1 ring-slate-200 focus:ring-2 focus:ring-brand-500"
        />
        <Button variant="secondary" onClick={add} className="!py-2">
          Add weight
        </Button>
      </div>
    </div>
  )
}
