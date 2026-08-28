import fs from 'node:fs';
import path from 'node:path';

// Minimal .env loader (no dotenv dependency).
function loadEnvFile(file = '.env') {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!m) continue;
    let v = (m[2] || '').trim();
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '').trim();   // strip trailing comments
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadEnvFile();

export const config = {
  token:             process.env.WHATSAPP_TOKEN || '',
  phoneNumberId:     process.env.PHONE_NUMBER_ID || '',
  verifyToken:       process.env.VERIFY_TOKEN || '',
  appSecret:         process.env.APP_SECRET || '',
  graphVersion:      process.env.GRAPH_VERSION || 'v21.0',
  supabaseUrl:      (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
  supabaseKey:       process.env.SUPABASE_SERVICE_KEY || '',
  adminNumbers:     (process.env.ADMIN_NUMBERS || '').split(',').map(s => s.replace(/\D/g, '')).filter(Boolean),
  timezone:          process.env.TIMEZONE || 'America/Denver',
  verdictHour:  Number(process.env.VERDICT_HOUR ?? 19),
  verdictMinute:Number(process.env.VERDICT_MINUTE ?? 0),
  verdictWeekdaysOnly: process.env.VERDICT_WEEKDAYS_ONLY !== '0',
  standingsTemplate: process.env.STANDINGS_TEMPLATE || '',
  heistHour:    Number(process.env.HEIST_HOUR ?? 18),
  heistEnabled:      process.env.HEIST_ENABLED !== '0',
  siteUrl:           process.env.SITE_URL || 'https://obtlrivpgdrxgydcpnqo.supabase.co/functions/v1/vault',
  port:         Number(process.env.PORT || 3000),
  dryRun:            process.env.DRY_RUN === '1',
};

/** Fail fast with a readable message instead of a cryptic URL/auth error later. */
export function assertConfig() {
  const missing = [];
  for (const [k, v] of Object.entries({
    WHATSAPP_TOKEN: config.token,
    PHONE_NUMBER_ID: config.phoneNumberId,
    VERIFY_TOKEN: config.verifyToken,
    SUPABASE_URL: config.supabaseUrl,
    SUPABASE_SERVICE_KEY: config.supabaseKey,
  })) if (!v) missing.push(k);

  if (missing.length) {
    console.error(`\nMissing required env vars: ${missing.join(', ')}`);
    console.error('Copy .env.example to .env and fill it in, or set them in your host dashboard.\n');
    process.exit(1);
  }
  if (!config.appSecret) {
    console.warn('[WARN] APP_SECRET is not set. Webhook signatures are NOT being verified,');
    console.warn('[WARN] which means anyone who finds your URL can post fake numbers. Set it.');
  }
  if (!config.adminNumbers.length) {
    console.warn('[WARN] ADMIN_NUMBERS is empty. Nobody can use announce or roster.');
  }
}
