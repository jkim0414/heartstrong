// Generate a REAL AI workout (same prompt/contract as api/generate.ts), validate
// it with the production validator, and print the resulting Workout as JSON.
// Usage: node (bundled) -- <phase> <date>
import { readFileSync } from 'node:fs'
import { getEligibleMovements, loadableLoads } from '../src/engine/generator'
import { validateAiWorkout } from '../src/engine/validate'
import { PHASES, WEEKLY_SCHEDULE } from '../src/data/phases'
import type { EquipmentItem, PhaseId, Profile, RawAiWorkout } from '../src/types'

const phase = (Number(process.argv[2]) || 3) as PhaseId
const date = process.argv[3] || '2026-06-01'

function readKey(): string {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const t = line.trim()
    if (t.startsWith('ANTHROPIC_API_KEY=')) return t.slice('ANTHROPIC_API_KEY='.length).trim()
  }
  throw new Error('no key')
}

const equipment: EquipmentItem[] = [
  { id: 'bodyweight', label: 'Bodyweight', owned: true, fixed: true },
  { id: 'openspace', label: 'Space', owned: true },
  { id: 'bench', label: 'Bench', owned: true },
  { id: 'jumprope', label: 'Jump rope', owned: true },
  { id: 'dumbbells', label: 'Dumbbells', owned: true, weightsLb: [20, 30] },
]
const profile: Profile = {
  role: 'patient', name: 'David', surgeryDate: '2026-02-23', clearedForExercise: true,
  sternalPrecautionsLifted: true, inCardiacRehab: true, phaseOverride: null, onboarded: true, aiEnabled: true,
}

const def = PHASES[phase]
const movements = getEligibleMovements(phase, profile, equipment).map((m) => ({ id: m.id, name: m.name, pattern: m.pattern }))
const loads = loadableLoads(equipment)
const weekday = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(date + 'T00:00:00').getDay()]

const SYSTEM = `You are a cardiac-rehabilitation-aware strength & conditioning coach building ONE day's workout for a 66-year-old man recovering from quadruple bypass (CABG) surgery, on a beta-blocker and dual antiplatelet therapy. Philosophy: "scaled CrossFit" — constantly varied, genuinely effective — NOT timid PT. Vary FORMATS and STRUCTURE (AMRAP, EMOM, rounds-for-time, intervals, ladders, chippers, themed). Give the session an engaging title. VOICE: address the user as "you"; never third person.
ABSOLUTE RULES: (1) use ONLY movements from the provided list by exact id; (2) intensity by RPE/talk test within the given range, never to failure; (3) every non-recovery session has a warmup first and cooldown last; (4) dumbbell loads only from owned weights, lighter for overhead; (5) ~20-45 min; (6) do not write movement cues — the app supplies them. Respond by calling submit_workout.`

const TOOL = {
  name: 'submit_workout',
  description: "Return the day's workout.",
  input_schema: {
    type: 'object', required: ['title','summary','estMinutes','rpeLow','rpeHigh','blocks'],
    properties: {
      title: { type: 'string' }, summary: { type: 'string' }, estMinutes: { type: 'number' },
      rpeLow: { type: 'number' }, rpeHigh: { type: 'number' }, talkTest: { type: 'string' }, isRecovery: { type: 'boolean' },
      blocks: { type: 'array', items: { type: 'object', required: ['block','title','items'], properties: {
        block: { type: 'string', enum: ['warmup','strength','metcon','cooldown'] }, title: { type: 'string' },
        format: { type: 'string' }, note: { type: 'string' },
        items: { type: 'array', items: { type: 'object', required: ['movementId','dose'], properties: {
          movementId: { type: 'string' }, dose: { type: 'string' }, loadLb: { type: 'number' } } } } } } } },
  },
}

const user = `Build today's workout.
Date: ${date} (${weekday})
Phase: ${def.name} — ${def.tagline}
Target effort: RPE ${def.rpeLow}-${def.rpeHigh}. Talk test: ${def.talkTest}
Upper-body/chest loading allowed: yes
Focus for this weekday: ${WEEKLY_SCHEDULE[phase][new Date(date + 'T00:00:00').getDay()]}
Loadable equipment (lb): ${Object.entries(loads).map(([k,v]) => `${k}: ${v.join('/')}`).join('; ')}
Movements you may use (exact id):
${movements.map((m) => `- ${m.id} — ${m.name} [${m.pattern}]`).join('\n')}
Compose a varied, engaging session and call submit_workout.`

const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': readKey(), 'anthropic-version': '2023-06-01' },
  body: JSON.stringify({
    model: 'claude-sonnet-4-6', max_tokens: 4000, temperature: 1,
    system: [{ type: 'text', text: SYSTEM }], tools: [TOOL],
    tool_choice: { type: 'tool', name: 'submit_workout' },
    messages: [{ role: 'user', content: user }],
  }),
})
const data = await res.json()
if (!res.ok) { console.error('API error', JSON.stringify(data).slice(0, 400)); process.exit(1) }
const toolUse = (data.content ?? []).find((c: any) => c.type === 'tool_use')
if (!toolUse) { console.error('NO TOOL USE. stop_reason=', data.stop_reason, 'content types=', (data.content ?? []).map((c: any) => c.type)); process.exit(1) }
const raw = toolUse.input as RawAiWorkout
console.error('RAW KEYS:', Object.keys(raw || {}), 'blocks=', Array.isArray(raw?.blocks) ? raw.blocks.length : typeof raw?.blocks)
const { workout, errors } = validateAiWorkout(raw, date, phase, profile, equipment)
if (!workout) { console.error('VALIDATION FAILED', errors); process.exit(1) }
console.error(`AI title: "${workout.title}" — blocks: ${workout.blocks.map((b) => b.block).join(',')}`)
console.log(JSON.stringify(workout))
