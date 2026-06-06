import { generateWorkout } from '../src/engine/generator'
import { determinePhase } from '../src/engine/phase'
import { alternatingRepsAreEven, estimateWorkoutMinutes } from '../src/engine/normalize'
import { MOVEMENTS_BY_ID } from '../src/data/movements'
import type { EquipmentItem, Profile } from '../src/types'

// Mirror of the app's default equipment (avoids importing the React store).
const DEFAULT_EQUIPMENT: EquipmentItem[] = [
  { id: 'bodyweight', label: 'Bodyweight movements', owned: true, fixed: true },
  { id: 'openspace', label: 'Space to walk / move', owned: true },
  { id: 'bench', label: 'Workout bench', owned: true },
  { id: 'jumprope', label: 'Jump rope', owned: true },
  { id: 'dumbbells', label: 'Dumbbells', owned: true, weightsLb: [20, 30] },
]

const base: Profile = {
  name: 'Test',
  surgeryDate: '2026-05-05',
  clearedForExercise: false,
  sternalPrecautionsLifted: false,
  inCardiacRehab: false,
  phaseOverride: null,
  onboarded: true,
}

// Mon–Sun in June 2026: 2026-06-01 is Monday.
const week = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07']

const scenarios: { label: string; profile: Profile }[] = [
  { label: 'P1 not cleared', profile: { ...base } },
  { label: 'P1 cleared, sternal ON (precautions)', profile: { ...base, clearedForExercise: true } },
  { label: 'P2 cleared + sternal lifted (~4wk via override)', profile: { ...base, clearedForExercise: true, sternalPrecautionsLifted: true, phaseOverride: 2 } },
  { label: 'P3 override', profile: { ...base, clearedForExercise: true, sternalPrecautionsLifted: true, phaseOverride: 3 } },
  { label: 'P4 override', profile: { ...base, clearedForExercise: true, sternalPrecautionsLifted: true, phaseOverride: 4 } },
  { label: 'P3 override but sternal NOT lifted (guardrail test)', profile: { ...base, clearedForExercise: true, sternalPrecautionsLifted: false, phaseOverride: 3 } },
]

let problems = 0

for (const s of scenarios) {
  const pr = determinePhase(s.profile, week[2])
  console.log(`\n=== ${s.label}  ->  phase ${pr.phase} (${pr.reason}) ===`)
  for (const d of week) {
    const w = generateWorkout(d, pr.phase, s.profile, DEFAULT_EQUIPMENT)
    const blockSummary = w.blocks.map((b) => `${b.block}(${b.items.length})`).join(' ') || 'rest'
    console.log(`  ${d} ${dow(d)}: ${w.title.padEnd(28)} [${blockSummary}]  RPE ${w.rpeLow}-${w.rpeHigh} ~${w.estMinutes}m`)

    // Guardrail: if sternal precautions NOT lifted, NO sternal-load movement may appear.
    if (!s.profile.sternalPrecautionsLifted) {
      for (const b of w.blocks) {
        for (const it of b.items) {
          const m = MOVEMENTS_BY_ID[it.movementId]
          if (m?.sternalLoad) {
            console.log(`    !!! VIOLATION: sternal-load movement "${m.name}" while precautions in effect`)
            problems++
          }
        }
      }
    }
    // Movements must respect minPhase.
    for (const b of w.blocks) {
      for (const it of b.items) {
        const m = MOVEMENTS_BY_ID[it.movementId]
        if (m && m.minPhase > pr.phase) {
          console.log(`    !!! VIOLATION: "${m.name}" minPhase ${m.minPhase} > phase ${pr.phase}`)
          problems++
        }
      }
    }
    // Invariant: alternating movements must have an even total rep count.
    for (const b of w.blocks) {
      for (const it of b.items) {
        if (!alternatingRepsAreEven(it)) {
          console.log(`    !!! VIOLATION: alternating "${it.name}" has odd reps: "${it.dose}"`)
          problems++
        }
      }
    }
    // Invariant: the displayed time estimate matches the prescription.
    const recomputed = estimateWorkoutMinutes(w.blocks, w.isRecovery)
    if (w.estMinutes !== recomputed) {
      console.log(`    !!! VIOLATION: estMinutes ${w.estMinutes} != recomputed ${recomputed}`)
      problems++
    }
  }
}

console.log(`\n${problems === 0 ? 'PASS — no guardrail violations' : `FAIL — ${problems} violations`}`)

function dow(d: string): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(d + 'T00:00:00').getDay()]
}

// Detail dump: Phase 3 Monday (strength + conditioning) with dumbbell loads.
console.log('\n--- DETAIL: P3 Monday ---')
const p3: Profile = { ...base, clearedForExercise: true, sternalPrecautionsLifted: true, phaseOverride: 3 }
const dw = generateWorkout('2026-06-01', 3, p3, DEFAULT_EQUIPMENT)
for (const b of dw.blocks) {
  console.log(`\n[${b.block}] ${b.title}${b.format ? ' — ' + b.format : ''}`)
  for (const it of b.items) console.log(`   • ${it.name} — ${it.dose}${it.loadLb != null ? ' @ ' + it.loadLb + 'lb' : ''}`)
}
