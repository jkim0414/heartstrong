import { decideSync, mergeForSync, type SyncMeta } from '../src/state/sync'
import type { AppState } from '../src/types'

// Cloud-sync decision tests. The headline case: a FAILED cloud read must never
// be treated as a brand-new account (that wiped real history before).

function state(over: Partial<AppState> = {}, onboarded = true): AppState {
  return {
    profile: { name: 'T', surgeryDate: '2026-05-04', clearedForExercise: true, sternalPrecautionsLifted: false, phaseOverride: null, onboarded, aiEnabled: true },
    equipment: [],
    log: {},
    overrides: {},
    aiCache: {},
    readiness: {},
    schemaVersion: 1,
    ...over,
  }
}
const fresh = () => state({}, false)
const clean: SyncMeta = { lastSyncedAt: 'T1', dirty: false }
const dirty: SyncMeta = { lastSyncedAt: 'T1', dirty: true }

let pass = 0
let fail = 0
function check(name: string, cond: boolean) {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}`)
  cond ? pass++ : fail++
}

const history = state({ log: { '2026-08-01': { date: '2026-08-01', status: 'completed', markedAt: '2026-08-01T10:00:00Z' } } })

// 1. Offline/outage with a cached copy -> keep working locally, unverified, no push.
{
  const d = decideSync({ ok: false }, history, clean, fresh)
  check('read fails + local copy -> use local, no push, unverified', d.kind === 'use' && d.state === history && !d.push && !d.verified)
}
// 2. THE BUG: read fails + nothing cached -> error screen, never a fresh seed.
{
  const d = decideSync({ ok: false }, null, clean, fresh)
  check('read fails + no local copy -> error (NOT onboarding/seed)', d.kind === 'error')
  const d2 = decideSync({ ok: false }, state({}, false), clean, fresh)
  check('read fails + un-onboarded local -> error', d2.kind === 'error')
}
// 3/4. Genuinely no row.
{
  const d = decideSync({ ok: true, state: null, updatedAt: null }, null, clean, fresh)
  check('no row + no local -> fresh state, push', d.kind === 'use' && !d.state.profile.onboarded && d.push && d.verified)
  const d2 = decideSync({ ok: true, state: null, updatedAt: null }, history, clean, fresh)
  check('no row + local history -> keep local, push (first upload never landed)', d2.kind === 'use' && d2.state === history && d2.push)
}
// 5. Normal open: cloud wins when this device has nothing unsynced.
{
  const cloud = state({ log: { '2026-08-02': { date: '2026-08-02', status: 'rest', markedAt: '2026-08-02T09:00:00Z' } } })
  const d = decideSync({ ok: true, state: cloud, updatedAt: 'T2' }, history, clean, fresh)
  check('clean local -> adopt cloud, no push', d.kind === 'use' && d.state === cloud && !d.push && d.lastSyncedAt === 'T2')
}
// 6. Offline edits, cloud untouched since -> local is newer, push it.
{
  const cloud = state()
  const d = decideSync({ ok: true, state: cloud, updatedAt: 'T1' }, history, dirty, fresh)
  check('dirty local + cloud unchanged -> keep local, push', d.kind === 'use' && d.state === history && d.push)
}
// 7. Both changed -> merge without losing either side's logs or symptom reports.
{
  const local = state({
    log: {
      '2026-08-01': { date: '2026-08-01', status: 'completed', markedAt: '2026-08-01T10:00:00Z', feltRpe: 4 },
      '2026-08-03': { date: '2026-08-03', status: 'completed', markedAt: '2026-08-03T10:00:00Z' },
    },
    readiness: { '2026-08-03': { ok: true, flagged: [] } },
  })
  const cloud = state({
    log: {
      '2026-08-01': { date: '2026-08-01', status: 'rest', markedAt: '2026-08-01T08:00:00Z' },
      '2026-08-02': { date: '2026-08-02', status: 'completed', markedAt: '2026-08-02T10:00:00Z' },
    },
    readiness: { '2026-08-03': { ok: false, flagged: ['chest'] } },
  })
  const d = decideSync({ ok: true, state: cloud, updatedAt: 'T9' }, local, dirty, fresh)
  const m = d.kind === 'use' ? d.state : null
  check('both changed -> merged + pushed', d.kind === 'use' && d.push && !!m && m !== local && m !== cloud)
  check('merge: union of dated logs', !!m && !!m.log['2026-08-01'] && !!m.log['2026-08-02'] && !!m.log['2026-08-03'])
  check('merge: later-marked entry wins on same date', m?.log['2026-08-01'].status === 'completed' && m?.log['2026-08-01'].feltRpe === 4)
  check('merge: reported symptom survives', !!m?.readiness['2026-08-03'].flagged.includes('chest'))
}
// 8/9. A never-onboarded cloud shell.
{
  const shell = state({}, false)
  const d = decideSync({ ok: true, state: shell, updatedAt: 'T5' }, history, dirty, fresh)
  check('empty cloud shell + dirty local history -> keep local, push', d.kind === 'use' && d.state === history && d.push)
  const d2 = decideSync({ ok: true, state: shell, updatedAt: 'T5' }, history, clean, fresh)
  check('deliberate erase elsewhere + clean local -> erase propagates', d2.kind === 'use' && d2.state === shell && !d2.push)
}
// mergeForSync keeps this device's profile/equipment edits.
{
  const local = state({ equipment: [{ id: 'rower', label: 'Rower', owned: true }] })
  const cloud = state({ equipment: [] })
  check('merge: local equipment edit kept', mergeForSync(local, cloud).equipment.length === 1)
}

console.log(`\n${fail === 0 ? `PASS — ${pass}/${pass} checks` : `FAIL — ${fail} failing`}`)
if (fail) process.exit(1)
