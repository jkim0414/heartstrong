// Serverless endpoint (Vercel-style: /api/generate).
//
// It holds the ANTHROPIC_API_KEY server-side — the key NEVER reaches the
// client. It asks Claude to compose a workout choosing ONLY from the
// safety-filtered movement list the client sends, and returns structured JSON.
// The client re-validates everything before display, so this endpoint is a
// "creativity" layer, not a trusted one.

interface ReqBody {
  date: string
  weekdayName: string
  phase: number
  phaseName: string
  phaseTagline: string
  rpeLow: number
  rpeHigh: number
  talkTest: string
  allowsSternalLoad: boolean
  suggestedFocus: string
  loads: Record<string, number[]>
  recentTitles: string[]
  recentPatterns?: string[]
  movements: { id: string; name: string; pattern: string; cue: string }[]
  conditions?: string
  medications?: string
  careNotes?: string
  salt: number
  /**
   * When present, plan ALL of these days as one coherent block (weekly
   * programming) instead of a single day. Rest/recovery days are excluded by
   * the client — only real training days are listed.
   */
  weekDays?: { date: string; weekdayName: string; suggestedFocus: string }[]
  /** Short adherence summary of the recent past, e.g. completed/missed counts. */
  adherence?: string
  /** Recent prescribed-vs-felt log lines (loads, felt RPE, weight feel, scores). */
  recentActuals?: string
  /** Owned equipment recent programming hasn't used. */
  underusedEquipment?: string[]
  /** Weeks since sternal precautions lifted (null/absent if unknown). */
  weeksSinceSternalLift?: number | null
}

const MODEL = 'claude-sonnet-4-6'

// Request bounds (all client-supplied) — generous for real use, tight enough
// that the endpoint can't be used to send huge prompts on our API key.
const MAX_MOVEMENTS = 150
const MAX_WEEK_DAYS = 14
const MAX_BODY_CHARS = 60_000
const MAX_PROFILE_FIELD = 1_500
const MAX_ACTUALS = 4_000
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

// Static safety doctrine — stable across requests, so we cache it.
const SYSTEM_DOCTRINE = `You are a cardiac-rehabilitation-aware strength & conditioning coach building ONE day's workout for an older adult recovering from heart surgery or a cardiac event. They are deconditioned but progressing, and are typically on cardiac medications (often a beta-blocker and blood thinners). Specific background about this person may be provided in the user message — use it only to stay appropriately cautious; it NEVER overrides the safety rules below.

The product philosophy is "scaled CrossFit" — constantly varied, genuinely effective training that moves the needle on strength and conditioning over time — NOT timid post-op physical therapy. Be creative and varied with FORMATS and STRUCTURE so no two days feel the same: mix AMRAPs, EMOMs, rounds-for-time, intervals, ascending/descending rep ladders, chippers, "every 3 minutes", steady aerobic pieces, and benchmark-style themed sessions. Give the session an engaging title.

KEEP IT LEAN — fewer movements done well beats a long, sprawling session. The medical and fitness benefit comes from consistency at moderate effort, not volume, and a long list of exercises just adds friction and fatigue for a deconditioned older beginner. Achieve variety mainly through the FORMAT and the few movements you choose — NOT by piling on more exercises. Aim for about 8 distinct movements across the whole session (and never more than ~10): roughly a 3-movement warm-up, a main block of just 2–3 movements, and a 3-movement cool-down. Resist the urge to add "one more".

WEEKLY PROGRAMMING: When the request lists multiple days, you are programming a training BLOCK, the way a real coach plans a week — not improvising days in isolation. Plan the listed days as one coherent whole: respect each day's suggested focus; vary the formats and themes across the week so no two days feel alike; and balance the loaded movement patterns (squat, hinge, push, pull, lunge, carry) across days so the same heavy pattern is never emphasized two training days in a row — a pattern worked hard one day should get lighter or no emphasis the next. Distribute harder and easier days sensibly (a harder day is followed by an easier one). Include core/midline work at least twice across the week. Rest and recovery days are handled by the app and are not in your list. If an adherence note says recent workouts were missed, ease the first day or two back in rather than resuming at full intensity.

PROGRESSION: When the request includes a recent-training log (what was prescribed vs how it felt), use it to progress DELIBERATELY, like a coach reviewing a training journal. If recent sessions consistently felt easy (felt effort at or below the bottom of the prescribed range, or weights reported "too light"), step loads up to the next available weight they own and/or add a modest amount of volume — one variable at a time, roughly 5-10% per week, never both a big load jump and a big volume jump at once. If anything felt "too heavy" or effort came in above the prescribed range, step back down and consolidate. If there is no log or it is mixed, hold steady. Never progress past the phase's effort ceiling.

UPPER-BODY RAMP-IN: If the request says sternal precautions lifted fewer than 4 weeks ago, the chest and arms are newly cleared after months of no loading: keep pressing/pushing exposures to one or two per week at light loads, prefer supported rows and hinges before presses, and introduce push-ups only from an incline. Progress upper-body load slower than lower-body.

EQUIPMENT ROTATION: If the request lists owned-but-recently-unused equipment, feature at least one of those items somewhere in the block where it genuinely fits (a rowing machine is a first-class conditioning tool, not an afterthought). Keep the movement pool wide — do not let the programming settle into the same few implements.

VOICE: All text you write (title, summary, format lines, notes) speaks directly TO the person exercising in the second person ("you"/"your"). Never refer to them in the third person — the app is read by the person themselves.

KEEP IT SIMPLE AND SHORT: Write for a 66-year-old beginner. Use short, plain sentences and minimal jargon. The "summary" is exactly ONE short sentence (about 20 words). Each block "note" is at most ONE short, plain sentence — omit it if it adds nothing. Keep "format" lines brief. No flowery or motivational filler, no anatomy jargon (say "the back of your legs", not "posterior chain"). Common format words like AMRAP or EMOM are okay (the app defines them for the reader), but keep everything else simple.

ABSOLUTE SAFETY RULES (never violate):
1. Use ONLY movements from the provided list, referenced by their exact "id". Never invent movements. The list is already filtered for what is safe at their current phase and sternal-precaution status — if a movement is not in the list, they may not do it today.
2. Intensity is judged by perceived effort (RPE 0-10) and the talk test, NEVER heart rate (cardiac medications such as beta-blockers make heart rate an unreliable intensity guide). Keep the whole session within the given rpeLow..rpeHigh range. Never program "to failure" or maximal effort.
3. Every non-recovery session MUST include a "warmup" block first and a "cooldown" block last. Strength and/or conditioning go in between.
4. Suggested dumbbell loads must come from the loads they own. Lighter loads for overhead/pressing.
5. Keep total time roughly 20-35 minutes (recovery days shorter), and keep the session lean: warm-up at most 3 movements, the main work (strength and/or conditioning) just 2-3 distinct movements, cool-down at most 3 movements — about 8 distinct movements total, never more than 10.
6. Do not write movement coaching cues — the app supplies vetted cues. You provide titles, the "format" line, a short block "note", the dose (e.g. "3 rounds x 10", "AMRAP 10 min", "30 sec hold"), and optional loadLb.
7. Keep doses logically consistent: for movements that alternate sides (lunges, step-ups, dead bug, etc.) prescribe an EVEN total rep count so both sides get equal work, and make sure the format's round/time math is coherent.
8. In a round-based or AMRAP circuit the athlete rotates through ALL the movements in order each round. Put the round/time structure in the block "format" (e.g. "5 rounds" or "AMRAP 10 min"), and give each movement ONLY its per-round dose (e.g. "8 reps", "2 min easy walk"). Do NOT repeat the round count on each movement (never "5 rounds x 8 reps" as a movement dose).

Always respond by calling the submit_workout tool.`

const WORKOUT_PROPERTIES = {
  title: { type: 'string', description: 'Short, engaging session title.' },
  summary: { type: 'string', description: 'One plain-language sentence on the day’s intent.' },
  estMinutes: { type: 'number' },
  rpeLow: { type: 'number' },
  rpeHigh: { type: 'number' },
  talkTest: { type: 'string' },
  isRecovery: { type: 'boolean' },
  blocks: {
    type: 'array',
    items: {
      type: 'object',
      required: ['block', 'title', 'items'],
      properties: {
        block: { type: 'string', enum: ['warmup', 'strength', 'metcon', 'cooldown'] },
        title: { type: 'string' },
        format: { type: 'string', description: 'e.g. "AMRAP 10 min", "3 rounds for quality"' },
        note: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['movementId', 'dose'],
            properties: {
              movementId: { type: 'string', description: 'exact id from the provided movement list' },
              dose: { type: 'string', description: 'e.g. "3 sets x 10", "200 m", "30 sec hold"' },
              loadLb: { type: 'number' },
            },
          },
        },
      },
    },
  },
}

const TOOL = {
  name: 'submit_workout',
  description: 'Return the composed workout for the day.',
  input_schema: {
    type: 'object',
    required: ['title', 'summary', 'estMinutes', 'rpeLow', 'rpeHigh', 'blocks'],
    properties: WORKOUT_PROPERTIES,
  },
}

const TOOL_WEEK = {
  name: 'submit_week',
  description: 'Return the composed workouts for every requested day of the week.',
  input_schema: {
    type: 'object',
    required: ['days'],
    properties: {
      days: {
        type: 'array',
        description: 'One entry per requested day, in the same order.',
        items: {
          type: 'object',
          required: ['date', 'title', 'summary', 'estMinutes', 'rpeLow', 'rpeHigh', 'blocks'],
          properties: {
            date: { type: 'string', description: 'The YYYY-MM-DD date this workout is for (from the request).' },
            ...WORKOUT_PROPERTIES,
          },
        },
      },
    },
  },
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'Server is not configured with an API key.' })
    return
  }

  // If auth is configured, require a valid Supabase session — this stops the
  // public URL from being used to spend API credits.
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseAnon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (supabaseUrl && supabaseAnon) {
    const authHeader = req.headers['authorization'] || req.headers['Authorization']
    const token = typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '') : ''
    if (!token) {
      res.status(401).json({ error: 'Sign-in required.' })
      return
    }
    try {
      const who = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { authorization: `Bearer ${token}`, apikey: supabaseAnon },
      })
      if (!who.ok) {
        res.status(401).json({ error: 'Invalid or expired session.' })
        return
      }
      // Optional allowlist: any account can sign up, so without this any
      // signed-in stranger can spend the API key. Unlisted accounts get a 403
      // and the app quietly uses its built-in workout engine instead.
      const allowed = (process.env.ALLOWED_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
      if (allowed.length) {
        const user = (await who.json().catch(() => null)) as { email?: string } | null
        if (!user?.email || !allowed.includes(user.email.toLowerCase())) {
          res.status(403).json({ error: 'AI workouts are not enabled for this account.' })
          return
        }
      }
    } catch {
      res.status(401).json({ error: 'Could not verify session.' })
      return
    }
  }

  try {
    const body: ReqBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body

    // Bound the prompt size: everything here is client-supplied.
    if (
      !body ||
      !Array.isArray(body.movements) ||
      body.movements.length > MAX_MOVEMENTS ||
      (body.weekDays?.length ?? 0) > MAX_WEEK_DAYS ||
      JSON.stringify(body).length > MAX_BODY_CHARS
    ) {
      res.status(400).json({ error: 'Request too large or malformed.' })
      return
    }
    const clip = (t: string | undefined, n: number) => (t ? t.slice(0, n) : t)
    body.conditions = clip(body.conditions, MAX_PROFILE_FIELD)
    body.medications = clip(body.medications, MAX_PROFILE_FIELD)
    body.careNotes = clip(body.careNotes, MAX_PROFILE_FIELD)
    body.recentActuals = clip(body.recentActuals, MAX_ACTUALS)

    const bg: string[] = []
    if (body.conditions) bg.push(`Conditions: ${body.conditions}`)
    if (body.medications) bg.push(`Medications: ${body.medications}`)
    if (body.careNotes) bg.push(`Care-team notes / things to avoid: ${body.careNotes}`)
    const background = bg.length
      ? `\nBackground about this person (for caution only — does NOT override the safety rules; do not prescribe around individual drugs, just stay conservative and never contradict these notes):\n${bg.join('\n')}\n`
      : ''

    const isWeek = Array.isArray(body.weekDays) && body.weekDays.length > 0

    const sharedContext = `${background}
Phase: ${body.phaseName} — ${body.phaseTagline}
Target effort: RPE ${body.rpeLow}–${body.rpeHigh}. Talk test: ${body.talkTest}
Upper-body/chest loading allowed: ${body.allowsSternalLoad ? 'yes' : 'NO — keep all load off the arms/chest'}${body.allowsSternalLoad && body.weeksSinceSternalLift != null ? ` (sternal precautions lifted ${body.weeksSinceSternalLift} week${body.weeksSinceSternalLift === 1 ? '' : 's'} ago — see UPPER-BODY RAMP-IN if under 4)` : ''}
Loadable equipment they own (use these weights for loadLb): ${Object.keys(body.loads).length ? Object.entries(body.loads).map(([k, v]) => `${k}: ${v.join('/')} lb`).join('; ') : 'none'}
${body.underusedEquipment?.length ? `Owned but not used in recent programming (see EQUIPMENT ROTATION): ${body.underusedEquipment.join(', ')}\n` : ''}${body.recentActuals ? `Recent training log (prescribed vs how it landed — see PROGRESSION):\n${body.recentActuals}\n` : ''}Recent session titles (make new days feel different): ${body.recentTitles.length ? body.recentTitles.join('; ') : 'none yet'}`

    const movementList = `Movements you may use (use the exact id):
${body.movements.map((m) => `- ${m.id} — ${m.name} [${m.pattern}]`).join('\n')}`

    const userContent = isWeek
      ? `Program the following training days as one coherent week.
${sharedContext}
Movement patterns emphasized on the most recent training day before this block (don't lead the first day with these): ${body.recentPatterns?.length ? body.recentPatterns.join(', ') : 'none / unknown'}
${body.adherence ? `Recent adherence: ${body.adherence}` : ''}

Days to program (rest/recovery days are already handled — do not add any):
${body.weekDays!.map((d) => `- ${d.date} (${d.weekdayName}) — suggested focus: ${d.suggestedFocus}`).join('\n')}

${movementList}

Compose the week within all the safety rules and call submit_week with one entry per listed day.`
      : `Build today's workout.
${sharedContext}
Date: ${body.date} (${body.weekdayName})
Rough focus for this weekday: ${body.suggestedFocus}
Movement patterns emphasized yesterday (for recovery, steer today's main load AWAY from these — lead with different patterns and don't re-stack the same heavy ones): ${body.recentPatterns?.length ? body.recentPatterns.join(', ') : 'none / unknown'}
Variation seed: ${body.salt}

${movementList}

Compose a varied, engaging session within all the safety rules and call submit_workout.`

    const anthropicReq = {
      model: MODEL,
      max_tokens: isWeek ? 12000 : 4000,
      temperature: 1,
      system: [
        { type: 'text', text: SYSTEM_DOCTRINE, cache_control: { type: 'ephemeral' } },
      ],
      tools: [isWeek ? TOOL_WEEK : TOOL],
      tool_choice: { type: 'tool', name: isWeek ? 'submit_week' : 'submit_workout' },
      messages: [{ role: 'user', content: userContent }],
    }

    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(anthropicReq),
    })

    if (!r.ok) {
      const detail = await r.text()
      res.status(502).json({ error: 'Upstream error', detail: detail.slice(0, 500) })
      return
    }

    const data = await r.json()
    const toolUse = (data.content ?? []).find((c: any) => c.type === 'tool_use')
    if (!toolUse) {
      res.status(502).json({ error: 'No structured workout returned.' })
      return
    }
    // Return the model's structured input; the client validates it.
    res.status(200).json(toolUse.input)
  } catch (e: any) {
    console.error('generate failed:', e)
    res.status(500).json({ error: 'Generation failed', detail: String(e?.message ?? e).slice(0, 300) })
  }
}
