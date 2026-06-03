import type { Workout, WorkoutBlock } from '../types'

const BLOCK_META: Record<string, { label: string; emoji: string; ring: string }> = {
  warmup: { label: 'Warm-up', emoji: '🌅', ring: 'ring-sky-200' },
  strength: { label: 'Strength', emoji: '🏋️', ring: 'ring-emerald-200' },
  metcon: { label: 'Conditioning', emoji: '🫀', ring: 'ring-teal-200' },
  cooldown: { label: 'Cool-down', emoji: '🧘', ring: 'ring-violet-200' },
}

function BlockCard({ block }: { block: WorkoutBlock }) {
  const meta = BLOCK_META[block.block]
  return (
    <div className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ${meta.ring}`}>
      <div className="flex items-center gap-2">
        <span className="text-xl" aria-hidden>
          {meta.emoji}
        </span>
        <h3 className="text-lg font-bold text-slate-900">{block.title}</h3>
      </div>
      {block.format && (
        <p className="mt-1 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">{block.format}</p>
      )}
      <ul className="mt-3 divide-y divide-slate-100">
        {block.items.map((item, i) => (
          <li key={i} className="py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-base font-semibold text-slate-900">{item.name}</span>
              <span className="shrink-0 text-right text-base font-semibold text-brand-700">
                {item.dose}
                {item.loadLb != null && <span className="block text-sm text-slate-500">{item.loadLb} lb</span>}
              </span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.cue}</p>
            {item.scaleDown && (
              <p className="mt-1 text-sm text-slate-500">
                <span className="font-semibold text-slate-600">Too much? </span>
                {item.scaleDown}
              </p>
            )}
          </li>
        ))}
      </ul>
      {block.note && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{block.note}</p>}
    </div>
  )
}

export function WorkoutView({ workout }: { workout: Workout }) {
  if (workout.blocks.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
        <p className="text-4xl">😌</p>
        <p className="mt-2 text-lg font-bold text-slate-900">{workout.title}</p>
        <p className="mt-1 text-base text-slate-600">{workout.summary}</p>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {workout.blocks.map((b, i) => (
        <BlockCard key={i} block={b} />
      ))}
    </div>
  )
}
