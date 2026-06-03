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
  movements: { id: string; name: string; pattern: string; cue: string }[]
  salt: number
}

const MODEL = 'claude-sonnet-4-6'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

// Static safety doctrine — stable across requests, so we cache it.
const SYSTEM_DOCTRINE = `You are a cardiac-rehabilitation-aware strength & conditioning coach building ONE day's workout for a 66-year-old man recovering from quadruple bypass (CABG) surgery. He also has a prior heart attack with stents, type 2 diabetes, high blood pressure, and is on a beta-blocker (carvedilol), an alpha-blocker (terazosin), and dual antiplatelet therapy. He is deconditioned but progressing.

The product philosophy is "scaled CrossFit" — constantly varied, genuinely effective training that moves the needle on strength and conditioning over time — NOT timid post-op physical therapy. Be creative and varied with FORMATS and STRUCTURE so no two days feel the same: mix AMRAPs, EMOMs, rounds-for-time, intervals, ascending/descending rep ladders, chippers, "every 3 minutes", steady aerobic pieces, and benchmark-style themed sessions. Give the session an engaging title.

VOICE: All text you write (title, summary, format lines, notes) speaks directly TO the person exercising in the second person ("you"/"your"). Never refer to him in the third person ("he"/"his") — the app is read by the user himself.

ABSOLUTE SAFETY RULES (never violate):
1. Use ONLY movements from the provided list, referenced by their exact "id". Never invent movements. The list is already filtered for what is safe at his current phase and sternal-precaution status — if a movement is not in the list, he may not do it today.
2. Intensity is judged by perceived effort (RPE 0-10) and the talk test, NEVER heart rate (his beta-blocker makes heart rate unreliable). Keep the whole session within the given rpeLow..rpeHigh range. Never program "to failure" or maximal effort.
3. Every non-recovery session MUST include a "warmup" block first and a "cooldown" block last. Strength and/or conditioning go in between.
4. Suggested dumbbell loads must come from the loads he owns. Lighter loads for overhead/pressing.
5. Keep total time roughly 20-45 minutes (recovery days shorter).
6. Do not write movement coaching cues — the app supplies vetted cues. You provide titles, the "format" line, a short block "note", the dose (e.g. "3 rounds x 10", "AMRAP 10 min", "30 sec hold"), and optional loadLb.

Always respond by calling the submit_workout tool.`

const TOOL = {
  name: 'submit_workout',
  description: 'Return the composed workout for the day.',
  input_schema: {
    type: 'object',
    required: ['title', 'summary', 'estMinutes', 'rpeLow', 'rpeHigh', 'blocks'],
    properties: {
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
    } catch {
      res.status(401).json({ error: 'Could not verify session.' })
      return
    }
  }

  try {
    const body: ReqBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body

    const userContent = `Build today's workout.

Date: ${body.date} (${body.weekdayName})
Phase: ${body.phaseName} — ${body.phaseTagline}
Target effort: RPE ${body.rpeLow}–${body.rpeHigh}. Talk test: ${body.talkTest}
Upper-body/chest loading allowed today: ${body.allowsSternalLoad ? 'yes' : 'NO — keep all load off the arms/chest'}
Rough focus for this weekday: ${body.suggestedFocus}
Loadable equipment he owns (use these weights for loadLb): ${Object.keys(body.loads).length ? Object.entries(body.loads).map(([k, v]) => `${k}: ${v.join('/')} lb`).join('; ') : 'none'}
Recent session titles (make today feel different): ${body.recentTitles.length ? body.recentTitles.join('; ') : 'none yet'}
Variation seed: ${body.salt}

Movements you may use today (use the exact id):
${body.movements.map((m) => `- ${m.id} — ${m.name} [${m.pattern}]`).join('\n')}

Compose a varied, engaging session within all the safety rules and call submit_workout.`

    const anthropicReq = {
      model: MODEL,
      max_tokens: 1500,
      temperature: 1,
      system: [
        { type: 'text', text: SYSTEM_DOCTRINE, cache_control: { type: 'ephemeral' } },
      ],
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'submit_workout' },
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
    res.status(500).json({ error: 'Generation failed', detail: String(e?.message ?? e).slice(0, 300) })
  }
}
