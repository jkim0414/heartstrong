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

// --- Phase ramp-in dwell: late sternal clearance must NOT catapult to P3 ---
{
  // Cleared at week 13 post-op: calendar says P3, dwell says P2 for 3 weeks.
  const lateLift: Profile = {
    ...base,
    clearedForExercise: true,
    sternalPrecautionsLifted: true,
    sternalPrecautionsLiftedOn: '2026-08-07', // ~13.5 wks after 2026-05-05 surgery
  }
  const cases: [string, string, number][] = [
    ['week 0 after lift', '2026-08-08', 2],
    ['week 2 after lift', '2026-08-22', 2],
    ['week 3 after lift (dwell served)', '2026-08-29', 3],
    ['legacy profile without lift date', '2026-08-08', 3],
  ]
  for (const [label, date, expected] of cases) {
    const prof = label.startsWith('legacy') ? { ...lateLift, sternalPrecautionsLiftedOn: undefined } : lateLift
    const got = determinePhase(prof, date).phase
    if (got !== expected) {
      console.log(`  !!! VIOLATION: dwell rule (${label}): expected P${expected}, got P${got}`)
      problems++
    } else {
      console.log(`  ok  dwell rule (${label}): P${got}`)
    }
  }
  // On-time clearance (week 7) is unaffected by the dwell: still P2 by calendar,
  // and P3 arrives at week 10 as before (dwell already served by then).
  const onTime: Profile = { ...base, clearedForExercise: true, sternalPrecautionsLifted: true, sternalPrecautionsLiftedOn: '2026-06-23' }
  const atW10 = determinePhase(onTime, '2026-07-14').phase
  if (atW10 !== 3) { console.log(`  !!! VIOLATION: on-time clearance should reach P3 at week 10, got P${atW10}`); problems++ }
  else console.log('  ok  dwell rule (on-time clearance unaffected): P3 at week 10')
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
