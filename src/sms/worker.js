import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dailyWindow, isDue, leaderboard, formatMessage } from './leaderboard.js';
import { loadLeaderboardData } from './data.js';

export function validateConfig(env) {
  for (const key of ['T1P_SUPABASE_URL','T1P_SUPABASE_SERVICE_KEY','METRO_SUPABASE_URL','METRO_SUPABASE_SERVICE_KEY','TELNYX_API_KEY','TELNYX_FROM_NUMBER','TELNYX_MESSAGING_PROFILE_ID','SMS_TO_NUMBER','SMS_STATE_DIR']) {
    if (!env[key]) throw new Error(`Missing ${key}`);
  }
  for (const key of ['SMS_ROSTER_ALIASES_VERIFIED','SMS_TELNYX_CONFIG_VERIFIED','SMS_REGISTRATION_VERIFIED']) {
    if (env[key] !== '1') throw new Error(`Pending ${key}`);
  }
  for (const key of ['TELNYX_FROM_NUMBER','SMS_TO_NUMBER']) if (!/^\+[1-9]\d{7,14}$/.test(env[key])) throw new Error(`Invalid ${key}`);
  for (const key of ['T1P_SUPABASE_URL','METRO_SUPABASE_URL']) if (new URL(env[key]).protocol !== 'https:') throw new Error(`Invalid ${key}`);
  const aliases = JSON.parse(env.SMS_CONFIRMED_ALIASES_JSON || '{}');
  if (!aliases || Array.isArray(aliases) || typeof aliases !== 'object') throw new Error('Invalid alias mapping');
  return aliases;
}
export async function runDaily(env, now = new Date(), request = fetch) {
  if (env.SMS_ENABLED !== '1' || !isDue(now)) return 'disabled-or-not-due';
  const aliases = validateConfig(env);
  const window = dailyWindow(now);
  const { roster, deals } = await loadLeaderboardData(env, window, request);
  const text = formatMessage(leaderboard(roster, deals, window, aliases), window);
  // Exclusive reservation on a persistent Railway volume prevents repeat sends after restart.
  // Keep reservation on unknown outcomes: never automatically retry an ambiguous send.
  const reservation = path.join(env.SMS_STATE_DIR, `${window.day}.json`);
  let file;
  try { file = await fs.open(reservation, 'wx'); }
  catch (error) { if (error.code === 'EEXIST') return 'already-reserved'; throw new Error('SMS persistent state unavailable'); }
  await file.writeFile(JSON.stringify({ day: window.day, status: 'reserved' }));
  await file.sync();
  await file.close();
  const response = await request('https://api.telnyx.com/v2/messages', {
    method: 'POST', headers: { Authorization: `Bearer ${env.TELNYX_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.TELNYX_FROM_NUMBER, to: env.SMS_TO_NUMBER, messaging_profile_id: env.TELNYX_MESSAGING_PROFILE_ID, text }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`SMS request failed (${response.status}); inspect reservation before retrying`);
  await fs.writeFile(reservation, JSON.stringify({ day: window.day, status: 'accepted' }));
  return 'accepted';
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { const result = await runDaily(process.env); if (result === 'accepted') console.log('[sms] accepted'); }
    catch { console.error('[sms] blocked or failed; inspect configuration and daily reservation'); }
    finally { busy = false; }
  };
  tick();
  setInterval(tick, 10000);
}
