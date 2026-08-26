import { config } from './config.js';

/** Local business day (YYYY-MM-DD) in the configured timezone. */
export function businessDay(date = new Date(), tz = config.timezone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

/** Monday-start week containing `day` (YYYY-MM-DD in, YYYY-MM-DD out). */
export function weekStart(day) {
  const d = new Date(`${day}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function normalizePhone(p) {
  return String(p || '').replace(/\D/g, '');
}

export const medal = i => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`);
