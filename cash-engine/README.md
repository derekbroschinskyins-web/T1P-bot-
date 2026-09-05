# T1P Cash Engine

Every policy Derek writes, priced against the FFL comp grids, showing written premium
against goal, the advance cash actually coming, what is left to make this month, and
how much unearned advance is still exposed to chargeback.

One HTML file. No build step, no framework, no bundler.

## Run it

```
npm run dev      # http://localhost:5173
npm test         # 11 tests, no network needed
```

Or just open `index.html` in a browser — everything except the service worker works
off the filesystem.

## How it stores things

| Where | What |
|---|---|
| Supabase `cash_policies` | one row per policy, keyed `(user_id, id)` |
| Supabase `cash_settings` | one row, `id = 'main'` — goals, contract level, per-carrier advance |
| `localStorage` | a mirror of the last sync, so the app opens offline with real data |

Row Level Security scopes every row to `auth.uid()`, and the policies only grant the
`authenticated` role. The key in `index.html` is the public key and is meant to ship —
with it and nothing else, a stranger reads zero rows and writes nothing.

The app talks to a small `db` shim (`makeDb`) that exposes the same
`doc()` / `collection()` / `onSnapshot()` shape the code was originally written against,
so `store.savePolicy` / `deletePolicy` / `saveSettings` and every caller are unchanged.
Supabase realtime drives the live updates. If Supabase is unreachable the shim drops out
and writes fall back to `localStorage`; the chip in the header tells you which mode you
are in.

## Setup from scratch

1. **Database.** Supabase → SQL Editor → New query → paste all of
   [`supabase/schema.sql`](supabase/schema.sql) → Run. Safe to re-run.
2. **Keys.** Supabase → Project Settings → API. Copy the **Project URL** and the
   **publishable** (anon) key into the two constants at the top of the `<script>` in
   `index.html`:
   ```js
   const SUPABASE_URL='https://<project>.supabase.co';
   const SUPABASE_KEY='sb_publishable_...';
   ```
   Both are public by design. Never put the `service_role` key in this file.
3. **Auth.** Supabase → Authentication → Providers → Email, enabled. First visit,
   choose *Create your account*. If **Confirm email** is on you get a confirmation
   link first; turn it off under Authentication → Sign In / Providers to skip that.
4. **Redirect URLs.** Authentication → URL Configuration → add your Netlify URL to
   *Redirect URLs*, otherwise the password-reset link bounces.

## The math is fixed

The comp grids, `rateFor()`, `calc()`, the advance/as-earned split and the chargeback
exposure decay are carried over byte for byte from the original build. They live in
`index.html` between the `/* math:start */` and `/* math:end */` markers, and
`test/engine.test.js` reads that region straight out of the shipped HTML — so the tests
can never drift from what runs. Change the math and the tests tell you.

Worked example the tests pin down: Mutual of Omaha Term Life Express, $100/month, level
100 → $1,200 annual premium, 100% comp, $1,200 first year, $900 advance at the 75%
default, $300 as-earned tail. Move to level 120 and the rate becomes 120%.

## Deploy

Netlify, publishing this folder. `netlify.toml` sets the single-page fallback, the
security headers, and stops `index.html` and `sw.js` from being cached stale.

## Install on a phone

Open the site in Safari or Chrome and Add to Home Screen. `manifest.webmanifest` makes
it standalone with the T1P mark, and `sw.js` caches the shell so it opens instantly and
still works on a plane with the last synced book.

## The Cockpit

The money side is only half the job, so there are two more tabs.

**Cockpit** is the daily leader view: who has gone too long without hearing from
you, a daily checklist with a streak, one training rep, the month's selling and
recruiting goals, and an advice panel that reads your actual numbers — team premium
against target versus how much of the month is gone, how much of the premium is
still yours, how many agents are sitting at zero, which new agents have not made a
first sale. It is rules over real data, not horoscopes.

**Team** lists every agent with their target, written premium, dials, appointments,
when they were last seen doing anything, and when you last checked in. "Check in"
logs a note and a read on how they are doing, and that history follows the agent.

### Where the team data comes from

Your agents already live in this Supabase project, fed by the WhatsApp bot — but
across three different id systems: `agents.id` for points and targets,
`agents.discord_id` for deals, and `agents.name` → `wa_agents.name` for activity.
Rather than stitch that together in the browser across five tables, it is one
Postgres function, `cash_team_pulse()`, called with `sb.rpc()`.

That function is `security definer` and gated on `cash_is_owner()`, which checks
your email against the `cash_owners` table. Two consequences worth knowing:

- **No existing table's security was changed.** `deals`, `sales`, `wa_activity` and
  `wa_agents` are still unreadable through the API by anyone; the function reads
  them on your behalf and only after checking who is asking.
- **Anyone else who signs up sees nothing.** They get their own empty policy book
  and an empty roster. Verified by role-switching in Postgres: as the owner the
  function returns the full roster, as any other authenticated user it returns zero
  rows.

Check-ins and the daily checklist are yours and use the same per-user RLS as the
policy book, in `cash_checkins` and `cash_journal`. They ride the same `makeDb`
shim — `db.collection('checkins')` and `db.doc('journal/2026-09-05')` — so adding
them needed no new plumbing.
