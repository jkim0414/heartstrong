# HeartStrong — setup checklist

These are the steps that need your own accounts/keys. ~15–20 minutes, mostly waiting and copy-paste. Helper scripts automate the rest (`npm run migrate`, `npm run check`).

> The AI workouts and accounts/sync are **optional**. Skip Supabase and the Anthropic key entirely and the app still runs fully (built-in workout engine, on-device storage) — just `npm install && npm run dev`.

## 0. Get an Anthropic API key (optional — for AI workouts)
At console.anthropic.com → **API Keys**, create a key. Copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY=...` (`.env.local` is gitignored — never commit real keys). If you ever paste a key somewhere public by accident, revoke and rotate it.

## 1. Create a Supabase project
1. Sign up at **supabase.com** → **New project** (pick a name, a strong DB password — save it — and a region near you).
2. Wait ~2 minutes for it to provision.

## 2. Copy three values into `.env.local`
In your Supabase project:
- **Settings → API**: copy **Project URL** → `VITE_SUPABASE_URL`, and **anon public** key → `VITE_SUPABASE_ANON_KEY`.
- **Settings → Database → Connection string → URI**: copy it → `DATABASE_URL` (used once, for the migration).

`.env.local` already has placeholders — just fill them in.

## 3. Create the database table (one command)
```bash
npm run migrate
```
This applies `supabase/schema.sql` (the `app_state` table + row-level security so each user only sees their own data).
*Alternative:* paste `supabase/schema.sql` into Supabase's **SQL Editor** and click Run.

## 4. Configure auth redirects
Supabase → **Authentication → URL Configuration**:
- **Site URL**: your eventual Vercel URL (you can set it now or after deploy).
- **Redirect URLs**: add `http://localhost:5173` (for local testing) and your Vercel URL.

Email login works out of the box. To enable **Google**: Authentication → Providers → Google (needs a Google OAuth client — optional, email magic-link is enough to start).

## 5. Test locally
```bash
npm run check     # verifies your env + Supabase connectivity
vercel dev        # runs the app AND the /api function (needed for AI workouts)
```
Open http://localhost:5173, sign in with your email, click the link it sends. (Plain `npm run dev` works too, but the AI endpoint only runs under `vercel dev`.)

## 6. Deploy to Vercel
1. `git push` to a GitHub repo (this folder is already a git repo with a first commit).
2. In Vercel: **Add New → Project → import the repo.** Framework preset: Vite (auto-detected). It builds `dist/` and serves `/api` automatically.
3. **Project → Settings → Environment Variables** — add all of these (same values as `.env.local`):
   - `ANTHROPIC_API_KEY`
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY` (same as the VITE ones — the function uses these to verify sign-ins)
4. Redeploy. Then set that deployed URL as the **Site URL** + a **Redirect URL** in Supabase (step 4).

## 7. Install on a phone
Open the deployed URL on the phone → **Share → Add to Home Screen** (iOS) / **⋮ → Add to Home Screen** (Android). Launches full-screen like a native app.

---
If anything errors, run `npm run check` and send me the output — I can debug from there.
