# HeartStrong ❤️

A cardiac-aware home workout PWA for people rebuilding fitness after a cardiac event (e.g., bypass / CABG surgery or a heart attack). It's designed to bridge from gentle, safe early recovery to progressive, genuinely effective conditioning.

It is **not** post-op physical therapy and **not** generic CrossFit. It's a phased bridge: it starts where a deconditioned, recently-operated body actually is (sternum still healing) and progresses, safely, toward scaled-CrossFit-style training — progressive dumbbell strength + metcons — as medical clearances come in.

> ⚕️ **Not medical advice.** HeartStrong is an educational tool, built as a personal project. It does not replace a cardiologist, surgeon, or cardiac-rehab program, and it is not affiliated with any medical provider. Anyone using it should get their doctor's clearance before starting and stop / seek care for any warning sign. Provided as-is, with no warranty — use at your own risk.

---

## Why it's built the way it is (the clinical reasoning)

The design reflects common considerations for someone recovering from bypass surgery or a heart attack. (It was originally tailored to one person's situation; the reasoning below is general.)

| Clinical consideration | What the app does about it |
| --- | --- |
| **On carvedilol (a beta-blocker)** — blunts and caps heart rate | Drives all intensity by **RPE (perceived exertion) + the talk test**, never heart-rate zones. Fitness-tracker "zones" are unreliable on this medication. |
| **~1 month post-sternotomy** — breastbone still healing (sternal precautions, usually 6–8 wks) | **Phase 1 loads nothing through the arms/chest.** Chest-loading movements (presses, rows, push-ups, carries, planks) are *hard-locked* until you mark sternal precautions lifted — this guardrail can't be overridden, even by a manual phase change. |
| **On aspirin + ticagrelor (dual antiplatelet)** — bleeding/bruising risk | Impact and fall-risk movements are minimized; jumping only appears in later phases and is always optional. |
| **On terazosin (alpha-blocker) + carvedilol** — orthostatic hypotension risk | Every session ends with a full cool-down and a "rise slowly" reminder. |
| **Type 2 diabetes** | Hypoglycemia + foot-care reminders in the Safety sheet. |
| **EF 60% (preserved), no heart failure, no arrhythmia** | Good prognosis → the program is allowed to *progress* into real strength + conditioning, not stay in rehab mode forever. |
| Cardiac rehab is the gold standard after CABG | The app actively nudges toward formal clearance and a supervised cardiac-rehab referral; it complements rehab, doesn't replace it. |

A daily **readiness check** (chest symptoms, breathlessness, dizziness, palpitations, incision pain, feeling unwell, swelling) gates each workout and recommends rest if anything is flagged. An always-visible **Warning signs** button lists stop-now symptoms and a one-tap **Call 911**.

> **This is an educational/encouragement tool, not medical advice.** It does not replace a cardiology team or cardiac rehab. Get clearance before starting, and stop / seek care for any warning sign.

---

## AI-generated workouts (optional, on by default)

For the CrossFit "constantly varied, never the same" feel, the app can generate each day's session with Claude — varied formats (AMRAP/EMOM/ladders/chippers/intervals), themes, and movement combinations — instead of the built-in engine.

It's wired to be **safe and key-safe**:

- The model may **only choose from the safety-filtered movement list** the app sends it (already excludes chest-loading and out-of-phase movements). It controls structure/format/selection/dosing/titles — not medical cues, which always come from the vetted library.
- **Every AI workout is re-validated in the browser** (`src/engine/validate.ts`) against the same hard rails: eligible movements only, loads clamped to what the user owns, RPE capped at the phase ceiling, warm-up + cool-down required. If anything fails → it silently **falls back to the deterministic engine**.
- The same fallback covers **offline / network failure**, so the app always works.
- The **API key lives only in the serverless function** (`/api/generate`) as an environment variable — it is never bundled into the client or sent to the user's device.

**Setup:** deploy to Vercel (zero-config: it detects Vite + the `/api` function), then set `ANTHROPIC_API_KEY` in the project's Environment Variables. That's it. To test the function locally: `npm i -g vercel && vercel dev` with a `.env.local` (see `.env.example`).

> **Do not paste your API key into chat or commit it.** Set it as an environment variable in the host dashboard only. A static-only deploy (no key/function) still works — it just uses the built-in engine.
>
> **Cost:** one short generation per day (~a few thousand tokens, with prompt caching on the static safety prompt). Pennies per month for one user. Tapping "New variation" makes one more call.

If you'd rather keep it fully offline/free, flip **Settings → AI-generated workouts** off and the built-in engine takes over entirely.

## Accounts & cloud sync (Supabase)

Each person signs in (passwordless email link, or Google) and their workouts/history **sync across devices**. Auth and data both run on **Supabase**.

How privacy is handled:
- Each user's entire app state is stored as one row in an `app_state` table, keyed to their account.
- **Row-Level Security** (see `supabase/schema.sql`) means a signed-in user can only ever read/write their *own* row — no user can see another's health data, enforced at the database.
- The `/api/generate` endpoint **requires a valid session** when Supabase is configured, so the public URL can't be used to spend your Anthropic credits.
- If Supabase env vars are absent, the app runs in **local-only mode** (no sign-in, data stays in that browser) — handy for dev and static demos.

**Setup (one time):**
1. Create a free project at supabase.com.
2. In **SQL Editor**, paste and run `supabase/schema.sql` (creates the table + security policies).
3. In **Authentication → Providers**, Email is on by default; optionally enable Google.
4. In **Authentication → URL Configuration**, add your deployed site URL (and `http://localhost:5173` for dev) to the redirect allow-list.
5. Set env vars (see `.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (+ the non-`VITE_` copies for the function). Deploy.

**Migrating existing on-device data:** if you used the app before signing in, then after your first sign-in go to **Settings → Account → "Import data already on this device"** to pull that history into your account. (New accounts start fresh, so other people signing in on the same device don't inherit your data.)

> Note on sync: it's last-write-wins per device, which is plenty for one person across a phone and laptop. Sign-out keeps the local cache on that device but hides it behind the next sign-in.

## Two modes: patient & caregiver

At sign-in you pick how you'll use HeartStrong:

- **Patient** — your own phased program (below).
- **Caregiver** — no workout plan; instead you **follow loved ones** who share a code with you.

**Caregiver view (read-only).** A patient creates a share code (Settings → *Share my progress*); a caregiver redeems it (*Follow someone*) and gets a read-only window into how they're doing — enforced by database row-level security, so a caregiver only ever sees people who explicitly shared with them, and can never change anything:

- **Today** — the exact plan their app shows, and whether they logged it (with their effort rating + note).
- **Progress** — streak, weekly goal, an 8-week consistency trend, a calendar, their notes, and a **flagged-symptom alert** surfacing any days they reported chest pain, palpitations, etc. on the readiness check.
- **Setup** — their phase, AI on/off, clearance status, equipment, and health profile.

## Health profile

An optional, free-text place (Settings) to record **conditions, current medications, and notes/restrictions from the care team**. It's shown as reminders, surfaced to a caregiver, and given to the AI as *caution context* — the app never interprets it to make clinical decisions, and the safety limits are identical regardless of what's entered.

## The phase engine

Phase is determined automatically from surgery date + clearance flags (override available in Settings, but the sternal guardrail always holds):

- **Phase 1 · Recover** — walking, breathing, gentle *unloaded* legs. RPE 2–3. (Until cleared + sternum healed.)
- **Phase 2 · Rebuild** — light dumbbell strength + steady intervals. RPE 3–5. (After sternal precautions lift.)
- **Phase 3 · Build** — progressive dumbbell strength + true metcons (AMRAPs, intervals, rounds). RPE 4–7.
- **Phase 4 · Perform** — varied, periodized scaled CrossFit. RPE up to 8 on intervals — never maximal.

Each day generates **warmup + workout (strength and/or conditioning) + cooldown**, drawn only from the user's available equipment, deterministic per day (stable once viewed) but varied across days.

## Features

- **Daily workout** — warm-up + workout (strength and/or conditioning) + cool-down, with plain-language coaching cues, scaling options, and suggested loads, built only from your equipment
- **Two modes** — patient (your own recovery) or caregiver (follow a loved one)
- **AI or built-in** — constantly-varied AI sessions (Claude) with a deterministic offline fallback; both safety-checked identically
- **Tap-to-define glossary** — fitness jargon (AMRAP, EMOM, RPE, hinge…) is tappable/hoverable for a plain-English definition
- **Daily readiness check** + an always-visible **warning signs / one-tap Call 911**
- **Editable equipment** (catalog + custom items) and an optional **health profile** (conditions / meds / care-team notes)
- **Streaks** (kind by design — logged rest days *freeze* the streak rather than break it), weekly goal, milestones
- **Calendar history**; check off each day, rate effort, add notes
- **Accounts + cloud sync** (optional, Supabase) so it follows you across devices — or run fully local & offline with no account
- Installable to a phone home screen (**PWA**), large-text accessible UI

---

## Running it

```bash
npm install
npm run dev      # local dev at http://localhost:5173
npm run build    # production build into dist/
npm run preview  # preview the production build
```

## Installing on a phone

The simplest path — **deploy the `dist/` folder** to any static host (all free):

- **Netlify**: run `npm run build`, then drag the `dist` folder onto https://app.netlify.com/drop. You get a URL instantly.
- **Vercel / Cloudflare Pages / GitHub Pages**: point at this repo; build command `npm run build`, output dir `dist`.

Then on the phone, open the URL and **"Add to Home Screen"** (iOS Safari: Share → Add to Home Screen; Android Chrome: ⋮ → Add to Home Screen). It launches full-screen like a native app and works offline.

Without the optional accounts backend (below), all data lives in the browser's local storage on that device — private, but not synced across devices. Enabling Supabase adds accounts + cross-device sync.

---

## Project layout

```
api/
  generate.ts  serverless function: holds the API key, verifies the session, calls Claude (structured output + caching)
supabase/
  schema.sql   table + Row-Level Security policies for per-user cloud data
src/
  data/        movements.ts (exercise library), phases.ts (phase defs + weekly schedule),
               safety.ts (clinical content), equipment.ts (equipment catalog), glossary.ts (jargon definitions)
  engine/      phase.ts (phase determination), generator.ts (offline workout engine + shared eligibility),
               llm.ts (calls /api/generate), validate.ts (re-validates AI output against the safety rails)
  state/       store.tsx (state + cloud sync, streaks, milestones), auth.tsx (Supabase auth context)
  lib/         date.ts (date math + seeded RNG), supabase.ts (client; null in local-only mode), care.ts (caregiver sharing)
  components/  Today, WorkoutView, ReadinessCheck, History, Progress, Equipment, Settings, SafetySheet,
               Onboarding, SignIn, CaregiverApp, CaregiverView, CareSection, Glossarize, ui
tools/
  gen-check.ts       engine smoke test — verifies safety guardrails across all phases/weekdays
  validate-check.ts  validator test — proves unsafe AI output (sternal-load, unknown moves, over-cap RPE) is rejected
```

To re-run the safety tests (bundle with esbuild + run with node):

```bash
./node_modules/.bin/esbuild tools/gen-check.ts --bundle --platform=node --format=esm --outfile=/tmp/gen-check.mjs && node /tmp/gen-check.mjs
./node_modules/.bin/esbuild tools/validate-check.ts --bundle --platform=node --format=esm --outfile=/tmp/validate-check.mjs && node /tmp/validate-check.mjs
```

---

## License

[MIT](LICENSE) © 2026 James Kim. Educational personal project — **not medical advice** and not affiliated with any medical provider. See the LICENSE file for the full warranty disclaimer.
