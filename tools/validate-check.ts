import { validateAiWeek, validateAiWorkout } from '../src/engine/validate'
import { alternatingRepsAreEven, estimateWorkoutMinutes } from '../src/engine/normalize'
import type { EquipmentItem, Profile, RawAiWorkout } from '../src/types'

const equipment: EquipmentItem[] = [
  { id: 'bodyweight', label: 'Bodyweight', owned: true, fixed: true },
  { id: 'openspace', label: 'Space', owned: true },
  { id: 'bench', label: 'Bench', owned: true },
  { id: 'jumprope', label: 'Rope', owned: true },
  { id: 'dumbbells', label: 'Dumbbells', owned: true, weightsLb: [20, 30] },
]

const p1: Profile = {
  name: 'T', surgeryDate: '2026-05-05', clearedForExercise: true,
  sternalPrecautionsLifted: false, inCardiacRehab: false, phaseOverride: null, onboarded: true, aiEnabled: true,
}
const p3: Profile = { ...p1, sternalPrecautionsLifted: true }

let pass = 0
let fail = 0
function check(name: string, cond: boolean) {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}`)
  cond ? pass++ : fail++
}

// 1. Sternal-load movement while precautions ON -> must reject.
const attack1: RawAiWorkout = {
  title: 'Sneaky press day', summary: 'x', estMinutes: 30, rpeLow: 2, rpeHigh: 3,
  blocks: [
    { block: 'warmup', title: 'wu', items: [{ movementId: 'marching_in_place', dose: '2 min' }] },
    { block: 'strength', title: 'str', items: [{ movementId: 'db_floor_press', dose: '3x10' }] },
    { block: 'cooldown', title: 'cd', items: [{ movementId: 'calf_stretch', dose: '30s' }] },
  ],
}
check('rejects sternal-load movement during precautions', validateAiWorkout(attack1, '2026-06-01', 1, p1, equipment).workout === null)

// 2. Unknown movement id -> reject.
const attack2: RawAiWorkout = {
  title: 'x', summary: 'x', estMinutes: 30, rpeLow: 2, rpeHigh: 3,
  blocks: [
    { block: 'warmup', title: 'wu', items: [{ movementId: 'marching_in_place', dose: '2 min' }] },
    { block: 'metcon', title: 'm', items: [{ movementId: 'box_jump_backflip', dose: '10' }] },
    { block: 'cooldown', title: 'cd', items: [{ movementId: 'calf_stretch', dose: '30s' }] },
  ],
}
check('rejects unknown movement', validateAiWorkout(attack2, '2026-06-01', 1, p1, equipment).workout === null)

// 3. Missing cooldown -> reject.
const attack3: RawAiWorkout = {
  title: 'x', summary: 'x', estMinutes: 30, rpeLow: 2, rpeHigh: 3,
  blocks: [
    { block: 'warmup', title: 'wu', items: [{ movementId: 'marching_in_place', dose: '2 min' }] },
    { block: 'metcon', title: 'm', items: [{ movementId: 'walk', dose: '10 min' }] },
  ],
}
check('rejects missing cooldown', validateAiWorkout(attack3, '2026-06-01', 1, p1, equipment).workout === null)

// 4. Valid P3 workout, over-cap RPE + absurd load -> accepted but clamped.
const good: RawAiWorkout = {
  title: 'Engine Builder', summary: 'fun', estMinutes: 35, rpeLow: 5, rpeHigh: 10,
  blocks: [
    { block: 'warmup', title: 'Prime', items: [{ movementId: 'leg_swings', dose: '8/side' }, { movementId: 'diaphragmatic_breathing', dose: '5 breaths' }] },
    { block: 'strength', title: 'Build', format: 'EMOM 10', items: [{ movementId: 'goblet_squat', dose: '8', loadLb: 999 }, { movementId: 'db_row', dose: '10', loadLb: 25 }] },
    { block: 'metcon', title: 'Finisher', format: 'AMRAP 8', items: [{ movementId: 'db_swing', dose: '12', loadLb: 30 }, { movementId: 'reverse_lunge', dose: '10' }] },
    { block: 'cooldown', title: 'Down', items: [{ movementId: 'quad_stretch', dose: '30s' }] },
  ],
}
const res = validateAiWorkout(good, '2026-06-01', 3, p3, equipment)
check('accepts valid P3 workout', res.workout !== null)
check('caps RPE high to phase ceiling (7)', res.workout?.rpeHigh === 7)
check('clamps absurd load to owned max (30)', res.workout?.blocks.find((b) => b.block === 'strength')?.items[0].loadLb === 30)
check('snaps load 25 -> owned pair', [20, 30].includes(res.workout?.blocks.find((b) => b.block === 'strength')?.items[1].loadLb ?? 0))
check('enriches movement name from library', res.workout?.blocks[0].items[0].name === 'Standing leg swings')

// 5. Consistency normalization: odd reps on an alternating movement + a bogus
//    time estimate must be corrected.
const messy: RawAiWorkout = {
  title: 'Messy math', summary: 'x', estMinutes: 999, rpeLow: 4, rpeHigh: 6,
  blocks: [
    { block: 'warmup', title: 'wu', items: [{ movementId: 'diaphragmatic_breathing', dose: '5 breaths' }] },
    { block: 'strength', title: 'str', items: [{ movementId: 'db_reverse_lunge', dose: '3 sets × 9', loadLb: 20 }] },
    { block: 'metcon', title: 'm', format: '6 rounds: 2 min brisk walk / 1 min easy walk', items: [{ movementId: 'reverse_lunge', dose: '7 reps' }] },
    { block: 'cooldown', title: 'cd', items: [{ movementId: 'quad_stretch', dose: '30s' }] },
  ],
}
const mres = validateAiWorkout(messy, '2026-06-01', 3, p3, equipment)
const strItem = mres.workout?.blocks.find((b) => b.block === 'strength')?.items[0]
const metItem = mres.workout?.blocks.find((b) => b.block === 'metcon')?.items[0]
check('evens alternating strength reps (9 -> 10)', strItem?.dose.includes('10') === true && alternatingRepsAreEven(strItem!))
check('evens alternating metcon reps (7 -> 8)', metItem?.dose === '8 reps' && alternatingRepsAreEven(metItem!))
check('recomputes bogus estMinutes from prescription', mres.workout != null && mres.workout.estMinutes !== 999 && mres.workout.estMinutes === estimateWorkoutMinutes(mres.workout.blocks, false))
check('interval-format estimate is sane (~18+ min, <=90)', (mres.workout?.estMinutes ?? 0) >= 18 && (mres.workout?.estMinutes ?? 99) <= 90)

// 6. Weekly plan: a good day is kept, an unsafe day is dropped (not fatal to
//    the rest of the week), and an unrequested date is ignored.
const okDay = {
  date: '2026-06-15',
  title: 'Good day', summary: 'x', estMinutes: 30, rpeLow: 4, rpeHigh: 6,
  blocks: [
    { block: 'warmup' as const, title: 'wu', items: [{ movementId: 'marching_in_place', dose: '2 min' }] },
    { block: 'metcon' as const, title: 'm', format: 'AMRAP 10 min', items: [{ movementId: 'air_squat', dose: '10 reps' }] },
    { block: 'cooldown' as const, title: 'cd', items: [{ movementId: 'quad_stretch', dose: '30s' }] },
  ],
}
const badDay = { ...okDay, date: '2026-06-16', title: 'Sneaky press', blocks: [okDay.blocks[0], { block: 'strength' as const, title: 's', items: [{ movementId: 'bb_bench_press', dose: '3x5' }] }, okDay.blocks[2]] }
const extraDay = { ...okDay, date: '2026-06-19', title: 'Not requested' }
const week = validateAiWeek({ days: [okDay, badDay, extraDay] }, ['2026-06-15', '2026-06-16', '2026-06-17'], 3, p3, equipment)
check('week: valid day kept', !!week['2026-06-15'])
check('week: unsafe day dropped without sinking the plan', !week['2026-06-16'] && !!week['2026-06-15'])
check('week: unrequested date ignored', !week['2026-06-19'])
check('week: missing day simply absent', !week['2026-06-17'])

// 7. Circuit dose cleanup: redundant per-item round count is stripped when the
//    block format already carries the rounds, leaving the per-round dose.
const circuit: RawAiWorkout = {
  title: 'Circuit', summary: 'x', estMinutes: 25, rpeLow: 3, rpeHigh: 5,
  blocks: [
    { block: 'warmup', title: 'wu', items: [{ movementId: 'marching_in_place', dose: '2 min' }] },
    { block: 'metcon', title: 'Circuit', format: '5 rounds — rotate through, rest as needed', items: [
      { movementId: 'sit_to_stand', dose: '5 rounds x 8 reps' },
      { movementId: 'glute_bridge', dose: '5 rounds x 10 reps' },
      { movementId: 'walk', dose: '5 rounds x 2 min easy walk' },
    ] },
    { block: 'cooldown', title: 'cd', items: [{ movementId: 'quad_stretch', dose: '30s' }] },
  ],
}
const cres = validateAiWorkout(circuit, '2026-06-01', 1, p1, equipment)
const cm = cres.workout?.blocks.find((b) => b.block === 'metcon')?.items.map((i) => i.dose)
check('circuit: strips redundant "5 rounds x" from items', JSON.stringify(cm) === JSON.stringify(['8 reps', '10 reps', '2 min easy walk']))

console.log(`\n${fail === 0 ? `PASS — ${pass}/${pass} checks` : `FAIL — ${fail} failing`}`)
