# T1P WhatsApp Bot

WhatsApp version of the T1P leaderboard. Agents text their numbers to a business
number, the bot logs them and pushes standings back out.

Zero npm dependencies. Pure Node 20+, built-in `http` and `fetch`.

## Read this first: what WhatsApp will and will not let you do

The official WhatsApp Cloud API **has no group chat support**. A bot cannot join,
read, or post in a WhatsApp group. Period. Anything you have seen that does this
is driving a personal account through an unofficial library, which is against
WhatsApp's terms and gets numbers banned.

So the shape is:

- Agents log in a **1:1 chat** with the business number.
- Standings and announcements go out as **individual messages** to each agent.
- Nobody sees anybody else's messages, only the standings the bot sends.

The other rule: the **24 hour window**. You can only send free-form text to
someone within 24 hours of their last message to you. Outside that, you need a
pre-approved message template. In practice an agent who logged dials today is
inside the window for the 7 PM verdict. Someone who logged nothing is not, so
their verdict send fails unless you set up a template (see step 6).

## Setup

### 1. Database

Supabase > SQL Editor > paste and run `migrations/001_init.sql`.

Grab from Settings > API:
- Project URL -> `SUPABASE_URL`
- `service_role` key -> `SUPABASE_SERVICE_KEY` (NOT the anon key, and never commit it)

### 2. Meta account and number

You have to do these yourself, they need your identity and a phone number.

1. Go to developers.facebook.com and create an app. Type: **Business**.
2. Add the **WhatsApp** product to it.
3. Meta gives you a free test number immediately. Good enough to prove the whole
   thing works before you buy anything.
4. For production, add a real number under WhatsApp > API Setup > Add phone number.
   It must be a number **not currently registered to any WhatsApp account**. If your
   business line already has WhatsApp on it, delete that account first or use a
   different number. This is the step that trips most people up.
5. From API Setup, copy the **Phone number ID** -> `PHONE_NUMBER_ID`.

### 3. Permanent token

The token on the API Setup page expires in 24 hours. For a real deploy:

1. business.facebook.com > Business Settings > Users > **System Users** > Add.
2. Give it Admin role, assign your app with full control.
3. Generate New Token > select your app > check `whatsapp_business_messaging`
   and `whatsapp_business_management` > set expiry to **Never**.
4. That token -> `WHATSAPP_TOKEN`.

Also grab App Settings > Basic > **App Secret** -> `APP_SECRET`. Without it the
bot cannot verify that webhooks actually came from Meta, and anyone who finds
your URL can post fake numbers into the leaderboard.

### 4. Deploy

Railway, same as your Discord bot:

```
railway init
railway up
```

Set every var from `.env.example` in the Railway dashboard. Make `VERIFY_TOKEN`
any random string you invent, you just need the same value in step 5. Railway
gives you a public URL, note it.

Confirm it is alive: `curl https://your-app.railway.app/health`

### 5. Point Meta at it

Meta app > WhatsApp > Configuration > Edit webhook:

- Callback URL: `https://your-app.railway.app/webhook`
- Verify token: your `VERIFY_TOKEN`

Click Verify and Save. It should go green instantly; if not, check Railway logs
for `[webhook] verified`.

Then **Manage** next to Webhook fields and subscribe to **`messages`**. Skipping
this is the single most common reason a working bot receives nothing.

### 6. Optional: the out-of-window template

Only needed if you want the 7 PM verdict to reach agents who did not message the
bot that day. WhatsApp > Message Templates > Create:

- Category: **Utility**
- Name: `daily_standings`
- Body: `{{1}}`

Approval usually takes under an hour. Then set `STANDINGS_TEMPLATE=daily_standings`.
Utility templates cost a fraction of a cent per send.

### 7. Onboard the team

Each agent texts the business number: `name Derek B`

Numbers must be saved with country code (`1801...`). Put your own number in
`ADMIN_NUMBERS` to unlock `announce` and `roster`.

## Commands

| Text | Does |
|---|---|
| `name Derek B` | register or rename |
| `dials 25` / `25 dials` / `d 25` | log dials |
| `pres 3` / `3 appts` | log presentations |
| `deals 1` / `1 sale` | log deals |
| `60` | bare number counts as dials |
| `me` | your numbers today |
| `board` | today's standings |
| `week` | this week, Monday start |
| `undo` | remove your last entry today |
| `help` | command list |
| `announce <text>` | admin only, sends to whole roster |
| `roster` | admin only, who is registered |

Ranking is deals, then presentations, then dials.

At `VERDICT_HOUR` on weekdays the bot sends final standings and names the day's
winner to everyone.

## Local development

```
cp .env.example .env     # fill it in
npm start
npm test                 # 20 tests, no network or DB needed
```

`DRY_RUN=1` logs outbound messages instead of sending them.

To take real webhooks locally, tunnel with `ngrok http 3000` and point the Meta
callback URL at the ngrok address.

## Notes

- Every inbound message id is stored unique, so Meta's webhook retries cannot
  double count anyone's dials.
- The server acks the webhook before doing any work. Meta retries anything that
  takes more than about 20 seconds.
- The business day is computed in `TIMEZONE`, not UTC, so late-evening logging
  lands on the right day.
