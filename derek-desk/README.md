# Derek’s Desk

Private personal CRM for Derek, hosted on Netlify. Vite + React; saved records and updates in the existing TOP ONE LEADERBOARD Supabase project.

## Use
Sign in with the existing verified T1P account. Start on Today, open a record, add what happened, choose an outcome and save a specific next step. Sales, Recruits, Team and Goals share the same saved memory. Plan with ChatGPT opens ChatGPT with instructions to use the connected Supabase app and read the stored assistant guide.

## Build and deploy
`npm ci`, `npm run build`. Netlify base directory `derek-desk`, publish `dist`, production branch `derek-personal-crm`. Node 22 or newer.

## Privacy
Client code contains only the public Supabase publishable key. Database RLS requires the exact owner auth user for all records. No leads or private notes are bundled or committed. Never add service-role keys, contact exports or health information to this repository.

## Current boundaries
Spark and Fortify records were imported on November 2, 2026; ongoing unattended lead synchronization is not configured. Recording a booking does not create a Spark/calendar event. Counters reflect outcomes saved in this CRM, not a reconciled company ledger. Submitted premium, issued premium and commissions received are separate additive records. Only record each financial event once. Daily bookings count distinct sales contacts on the Mountain calendar day.

## Assistant maintenance
Read `derek_crm_settings` key `assistant_guide` through the connected Supabase app. Use the transactional `derek_crm_save_update` RPC for notes and outcomes, with a unique idempotency UUID. Preserve source contact restrictions and existing notes on refresh. Do not infer appointments, issued premium, commissions or recruiting outcomes. Current saved strategy is in settings key `strategy`.

## Team rollout and rewards (November 4)
Derek’s existing memory stays in derek_crm_settings. Approved team members use t1p_desk_memory, keyed by owner and record key. Verified sign-in claims and leader-created email invitations control enrollment; client metadata grants no access. Team Score is leader-only and reads trigger-maintained daily aggregates, not private member notes/client records. Setup SQL is database/team-score.sql. All metrics are manually logged; no Wavv, calendar, or Metro Man auto-import is implied.

25 car achievements use source events after reset receipts: daily 50 then 150 through 950, morning/afternoon 50/150/250, first dial before 09:00 America/Denver using the real timestamp, 4 daily presentations, 10 daily presentations+appointments, 5 daily appointments, first sale, 3 daily sales, 3/7 goal-day streaks, 5 leadership actions. Car images are AI-created automotive illustrations rendered photographically, supplied as one 25-cell atlas. Explicit block selection supports delayed manual batches; it cannot backdate the before-9 achievement.
