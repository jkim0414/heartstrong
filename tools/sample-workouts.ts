import { generateWorkout } from '../src/engine/generator'
import type { EquipmentItem, PhaseId, Profile } from '../src/types'

// Exactly what he has today.
const equipment: EquipmentItem[] = [
  { id: 'bodyweight', label: 'Bodyweight', owned: true, fixed: true },
  { id: 'openspace', label: 'Space', owned: true },
  { id: 'bench', label: 'Bench', owned: true },
  { id: 'jumprope', label: 'Jump rope', owned: true },
  { id: 'dumbbells', label: 'Dumbbells', owned: true, weightsLb: [20, 30] },
]

function profile(surgeryDate: string, sternalLifted: boolean): Profile {
  return {
    role: 'patient',
    name: 'David',
    surgeryDate,
    clearedForExercise: true,
    sternalPrecautionsLifted: sternalLifted,
    inCardiacRehab: true,
    phaseOverride: null,
    onboarded: true,
    aiEnabled: false,
  }
}

// Representative days. Mon=2026-06-01, Tue=06-02, Fri=06-05.
const PLAN: { phase: PhaseId; surgery: string; sternal: boolean; days: string[] }[] = [
  { phase: 1, surgery: '2026-05-04', sternal: false, days: ['2026-06-01', '2026-06-02'] },
  { phase: 2, surgery: '2026-04-06', sternal: true, days: ['2026-06-01', '2026-06-05'] },
  { phase: 3, surgery: '2026-02-23', sternal: true, days: ['2026-06-01', '2026-06-02'] },
  { phase: 4, surgery: '2026-01-12', sternal: true, days: ['2026-06-01', '2026-06-05'] },
]

for (const p of PLAN) {
  const prof = profile(p.surgery, p.sternal)
  for (const d of p.days) {
    const w = generateWorkout(d, p.phase, prof, equipment)
    console.log(`\n############################################################`)
    console.log(`PHASE ${p.phase} — ${w.title}  (RPE ${w.rpeLow}-${w.rpeHigh}, ~${w.estMinutes} min)`)
    console.log(`${w.summary}`)
    console.log(`Talk test: ${w.talkTest}`)
    for (const b of w.blocks) {
      console.log(`\n  [${b.block.toUpperCase()}] ${b.title}${b.format ? ' — ' + b.format : ''}`)
      for (const it of b.items) {
        console.log(`    • ${it.name} — ${it.dose}${it.loadLb != null ? ` @ ${it.loadLb} lb` : ''}`)
      }
    }
  }
}
