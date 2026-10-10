# T1P daily SMS

Separate one-way worker: `npm run sms`. The existing `npm start`, WhatsApp code,
variables, and 7 p.m. WhatsApp verdict are unchanged. SMS sends every day at
6 p.m. America/Denver, including weekends. Node Intl applies daylight saving time.
Run as one continuously running Railway replica with a persistent volume; do not
use a fixed UTC daily cron. Polling every ten seconds sends during the 18:00 minute.
If the worker misses that minute, it skips that day rather than sending stale data.

Each message ranks the full T1P roster by Metro deal count, includes agents with
zero deals, and names all tied top agents. No positive deals means no Top Agent.
One Metro deal row counts as one deal. `created_at` is the entry timestamp;
`submitted_at` and premium amounts do not determine inclusion. The query includes
that local day's midnight and exactly 18:00:00 and excludes later timestamps.
After-cutoff deals are never rolled into the next day's SMS.

## Configuration and enablement

Use `.env.sms.example` for the separate SMS service's Railway Variables. Enter the
recipient directly as `SMS_TO_NUMBER` in E.164 format. Do not share recipient or
credentials in chat, commit them, or paste them into logs. When available, transfer
the Telnyx key and sending number directly into `TELNYX_API_KEY` and
`TELNYX_FROM_NUMBER` in Railway. Do not change another bot's service or source.

Keep `SMS_ENABLED=0` until all checks below are complete, and do not deploy or send
as part of preparation. No test SMS is needed for unit tests.

1. Verify `agents` in TOP ONE LEADERBOARD is the intended roster. Matching uses
   exact case-insensitive trimmed roster names, existing saved `metro_name`, and
   explicitly confirmed aliases. No fuzzy or first-name expansion is performed.
   Put confirmed mappings in `SMS_CONFIRMED_ALIASES_JSON`, e.g.
   `{"agent-id":["Confirmed Metro Name"]}`. Unknown IDs and alias collisions fail.
   Set `SMS_ROSTER_ALIASES_VERIFIED=1` only after all intended mappings are verified.
2. Verify in Telnyx that the sending number is SMS capable, belongs to the account,
   is assigned to `TELNYX_MESSAGING_PROFILE_ID`, and the profile permits the intended
   outbound destination. Check number/profile settings, account sending limits,
   and Telnyx-managed opt-out handling. Set `SMS_TELNYX_CONFIG_VERIFIED=1` afterward.
3. Verify the sender's required registration is approved and associated with the
   number/profile: approved 10DLC brand/campaign for a US local sender, or approved
   toll-free verification for a toll-free sender. Confirm intended use and recipient
   consent. Set `SMS_REGISTRATION_VERIFIED=1` only after verification.
4. Mount a persistent Railway volume and create the `SMS_STATE_DIR` directory on
   it. Run one replica. The worker reserves each Denver date atomically before
   sending; an accepted request is not a delivery confirmation. Failed or ambiguous
   requests remain reserved to prevent duplicates. Inspect provider status before
   manually clearing a reservation. Never clear it simply to retry a timeout.
5. After configuration is verified and deployment/send is authorized, enable
   `SMS_ENABLED=1` on this service only. No inbound command or webhook is added.

## Inspection on 2026-10-10

The existing branch is `codex/t1p-daily-sms-leaderboard` (spaces cannot occur in Git
branch names). Metro project: `lykfmvgscybwcbgrkqno`; T1P: `obtlrivpgdrxgydcpnqo`.
The live roster has Alex B, Andrew A, Austin, Bella, Connor Tuttle, Derek, Isaia,
Quinton A, and Rive. All `metro_name` and `metro_claimed_at` fields were null.
Earlier confirmed aliases are not present in this branch or these roster fields;
they remain a configuration blocker and have not been inferred from Metro names.

The visible Railway projects contain two `leaderboard-bot` services and one
`t1p-leaderboard-bot`; none points at `T1P-bot-`. The latter's variable names contain
Supabase/Discord configuration but no Telnyx or SMS configuration. No Railway
changes were made. No Telnyx connector or runtime credential binding was available,
so messaging configuration and registration remain unverified. SMS remains off.

Run `npm test` for existing WhatsApp and SMS tests. SMS tests cover summer/winter
UTC offsets, both DST transition days, midnight and exact cutoff, after-cutoff
exclusion, scheduling, aliases, outsiders, ties, zero deals, pagination, disabled
and unverified configuration, and persistent duplicate prevention.
