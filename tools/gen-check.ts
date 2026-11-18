import { generateWorkout, loadIndexRange, loadableLoads } from '../src/engine/generator'
import { determinePhase } from '../src/engine/phase'
import { deterministicFor, loadOffsetFor } from '../src/engine/plan'
import { addDays } from '../src/lib/date'
import type { AppState } from '../src/types'
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

// --- Engine quality rails: loads, session length, dose coherence ------------
{
  const expect = (label: string, cond: boolean, detail = '') => {
    if (!cond) { console.log(`  !!! VIOLATION: ${label} ${detail}`); problems++ }
  }
  // A well-stocked home gym: the engine must not treat "owns it" as "lift it".
  const RICH: EquipmentItem[] = [
    ...DEFAULT_EQUIPMENT.filter((e) => e.id !== 'dumbbells'),
    { id: 'dumbbells', label: 'Dumbbells', owned: true, weightsLb: [10, 15, 20, 30, 40] },
    { id: 'kettlebell', label: 'Kettlebell', owned: true, weightsLb: [5, 10, 15, 20] },
    { id: 'rower', label: 'Rowing machine', owned: true },
    { id: 'barbell', label: 'Barbell + plates', owned: true, weightsLb: [45, 65, 95, 135, 185] },
  ]
  const loads = loadableLoads(RICH)
  const HOLD_IDS = new Set(['wall_sit', 'plank_bench'])
  const lifted: Profile = { ...base, clearedForExercise: true, sternalPrecautionsLifted: true }
  let sessions = 0
  let heaviestSeen = 0
  for (const phase of [1, 2, 3, 4] as const) {
    const prof: Profile = phase === 1 ? { ...base, clearedForExercise: true } : lifted
    for (let i = 0; i < 28; i++) {
      const d = addDays('2026-06-01', i)
      for (const offset of [0, 2]) {
        const w = generateWorkout(d, phase, prof, RICH, undefined, [], offset)
        sessions++
        expect('session over 45 min', w.estMinutes <= 45, `${d} P${phase} "${w.title}" ~${w.estMinutes}m`)
        for (const b of w.blocks) {
          const emom = (b.format ?? '').startsWith('EMOM')
          for (const it of b.items) {
            const m = MOVEMENTS_BY_ID[it.movementId]
            if (it.loadLb != null) {
              const wts = m.requires.map((r) => loads[r]).find((x) => x && x.length)!
              const { base: bi, cap } = loadIndexRange(phase, m, wts.length)
              expect('load above phase ceiling', it.loadLb <= wts[cap], `${m.id}@${it.loadLb} P${phase}`)
              if (offset === 0) {
                expect('default load is not the phase default', it.loadLb === wts[bi], `${m.id}@${it.loadLb} P${phase}`)
                expect('default load is the heaviest owned', it.loadLb < wts[wts.length - 1], `${m.id}@${it.loadLb} P${phase}`)
                heaviestSeen = Math.max(heaviestSeen, it.loadLb)
              }
            }
            if (HOLD_IDS.has(m.id) && (b.block === 'strength' || b.block === 'metcon')) expect('hold dosed in reps', /sec/.test(it.dose), `${m.id}: "${it.dose}"`)
            if (m.pattern === 'carry') expect('carry dosed in reps', /\d+ m\b/.test(it.dose), `${m.id}: "${it.dose}"`)
            if (emom) expect('EMOM item cannot fit in a minute', !/200 m|40 m/.test(it.dose), `${m.id}: "${it.dose}"`)
          }
        }
      }
    }
  }
  console.log(`  ok  engine rails across ${sessions} generated sessions (heaviest default load with 40 lb DBs + 185 lb bar owned: ${heaviestSeen} lb)`)

  // --- Consistency gate: Phase 3/4 are earned by recent training -----------
  const veteran: Profile = { ...lifted, surgeryDate: '2026-05-04', sternalPrecautionsLiftedOn: '2026-08-07' }
  const day = '2026-11-17' // week 28 post-op: Phase 4 by the calendar; a Tuesday
  const logWith = (n: number): AppState['log'] => {
    const log: AppState['log'] = {}
    for (let i = 0; i < n; i++) { const d = addDays('2026-11-14', -i * 2); log[d] = { date: d, status: 'completed', markedAt: d } }
    return log
  }
  const gate: [string, AppState['log'] | undefined, number][] = [
    ['no log supplied -> calendar phase', undefined, 4],
    ['long layoff (0 recent sessions) -> Phase 2', {}, 2],
    ['3 recent sessions -> still Phase 2', logWith(3), 2],
    ['4 recent sessions -> Phase 3', logWith(4), 3],
    ['8 recent sessions -> Phase 3', logWith(8), 3],
    ['9 recent sessions -> Phase 4', logWith(9), 4],
  ]
  for (const [label, log, want] of gate) {
    const got = determinePhase(veteran, day, log).phase
    expect(`consistency gate (${label})`, got === want, `expected P${want}, got P${got}`)
    if (got === want) console.log(`  ok  consistency gate (${label}): P${got}`)
  }
  // Workouts logged THIS week must not flip the phase mid-week.
  const midweek = logWith(3)
  for (const d of ['2026-11-15', '2026-11-16', '2026-11-17']) midweek[d] = { date: d, status: 'completed', markedAt: d }
  const sun = determinePhase(veteran, '2026-11-15', midweek).phase
  const sat = determinePhase(veteran, '2026-11-21', midweek).phase
  const nextSun = determinePhase(veteran, '2026-11-22', midweek).phase
  expect('phase stable within a week', sun === 2 && sat === 2, `Sun P${sun}, Sat P${sat}`)
  expect('phase re-checks the following week', nextSun === 3, `next Sun P${nextSun}`)
  if (sun === 2 && sat === 2 && nextSun === 3) console.log('  ok  consistency gate (stable within the week, steps up the next): P2 → P3')
  const manual = determinePhase({ ...veteran, phaseOverride: 4 }, day, {}).phase
  expect('manual override bypasses the gate', manual === 4, `got P${manual}`)
  const early = determinePhase({ ...lifted, surgeryDate: '2026-10-01', sternalPrecautionsLiftedOn: '2026-10-20' }, day, {}).phase
  expect('gate never raises or lowers Phase 2', early === 2, `got P${early}`)

  // --- Load feedback integrator -------------------------------------------
  const st = (log: AppState['log']): AppState => ({ profile: veteran, equipment: RICH, log, overrides: {}, aiCache: {}, readiness: {}, schemaVersion: 1 })
  const fb = (pairs: [string, 'light' | 'right' | 'heavy'][]): AppState['log'] =>
    Object.fromEntries(pairs.map(([d, f]) => [d, { date: d, status: 'completed' as const, loadFeel: f, markedAt: d }]))
  const o1 = loadOffsetFor(st(fb([['2026-11-01', 'light'], ['2026-11-03', 'light'], ['2026-11-05', 'light']])), day)
  const o2 = loadOffsetFor(st(fb([['2026-11-01', 'light'], ['2026-11-03', 'light'], ['2026-11-05', 'heavy']])), day)
  const o3 = loadOffsetFor(st(fb([['2026-11-01', 'right'], ['2026-11-17', 'light'], ['2026-11-18', 'light']])), day)
  const o4 = loadOffsetFor(st(fb([['2026-11-01', 'heavy'], ['2026-11-03', 'heavy'], ['2026-11-05', 'heavy']])), day)
  expect('"too light" x3 steps up, capped at +2', o1 === 2, `got ${o1}`)
  expect('one "too heavy" brings a raised load back down', o2 === 1, `got ${o2}`)
  expect('feedback from the same day or later is ignored (plan stays stable)', o3 === 0, `got ${o3}`)
  expect('"too heavy" x3 steps down, capped at -2', o4 === -2, `got ${o4}`)
  if (o1 === 2 && o2 === 1 && o3 === 0 && o4 === -2) console.log('  ok  load feedback integrator (+2 cap, responsive to "too heavy", ignores same-day)')
  // …and the built-in plan actually uses it.
  const quiet = deterministicFor(st(logWith(9)), '2026-11-19')
  const lightLog = { ...logWith(9), ...fb([['2026-11-01', 'light'], ['2026-11-03', 'light']]) }
  const raised = deterministicFor(st(lightLog), '2026-11-19')
  const firstLoad = (w: typeof quiet) => w.blocks.flatMap((b) => b.items).find((i) => i.loadLb != null)?.loadLb ?? 0
  expect('"too light" feedback raises the built-in plan\'s loads', firstLoad(raised) > firstLoad(quiet), `${firstLoad(quiet)} -> ${firstLoad(raised)}`)
  if (firstLoad(raised) > firstLoad(quiet)) console.log(`  ok  built-in plan responds to feedback (${firstLoad(quiet)} lb -> ${firstLoad(raised)} lb)`)
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
