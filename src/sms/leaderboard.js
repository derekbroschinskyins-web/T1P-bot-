export const TIMEZONE = 'America/Denver';
const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function localParts(now) {
  return Object.fromEntries(formatter.formatToParts(now).map(p => [p.type, p.value]));
}
// Resolve each local boundary independently: DST-transition days have unequal offsets.
function instant(day, hour) {
  const target = Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00Z`);
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const p = localParts(new Date(guess));
    const local = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
    guess += target - local;
  }
  return new Date(guess).toISOString();
}
export function dailyWindow(now = new Date()) {
  const p = localParts(now);
  const day = `${p.year}-${p.month}-${p.day}`;
  return { day, start: instant(day, 0), cutoff: instant(day, 18) };
}
export function isDue(now) {
  const p = localParts(now);
  return p.hour === '18' && p.minute === '00';
}
const normalize = s => String(s || '').trim().toLowerCase();
export function leaderboard(roster, deals, window, aliases = {}) {
  if (!roster.length) throw new Error('Empty roster');
  const rows = roster.map(a => ({ id: a.id, name: a.name, deals: 0 }));
  const names = new Map();
  for (const a of roster) {
    const extra = aliases[a.id] || [];
    if (!Array.isArray(extra)) throw new Error('Aliases must be arrays');
    for (const name of [a.name, a.metro_name, ...extra].filter(Boolean)) {
      const key = normalize(name);
      if (names.has(key) && names.get(key) !== a.id) throw new Error('Ambiguous alias');
      names.set(key, a.id);
    }
  }
  for (const id of Object.keys(aliases)) if (!rows.some(a => a.id === id)) throw new Error('Alias outside roster');
  const seen = new Set();
  for (const d of deals) {
    const timestamp = Date.parse(d.created_at);
    if (!Number.isFinite(timestamp) || timestamp < Date.parse(window.start) || timestamp > Date.parse(window.cutoff)) continue;
    if (seen.has(String(d.id))) continue;
    seen.add(String(d.id));
    const id = names.get(normalize(d.agent_name));
    const row = rows.find(a => a.id === id);
    if (row) row.deals++;
  }
  return rows.sort((a,b) => b.deals - a.deals || a.name.localeCompare(b.name));
}
export function formatMessage(rows, window) {
  const top = rows[0]?.deals || 0;
  const winners = rows.filter(a => a.deals === top).map(a => a.name).join(', ');
  return `T1P Daily Leaderboard ${window.day}\nMidnight through 6 p.m. Mountain Time\nTop Agent by deal count: ${top ? `${winners} (${top})` : 'None (0 deals)'}\n\n${rows.map((a,i) => `${i+1}. ${a.name}: ${a.deals}`).join('\n')}\nTotal: ${rows.reduce((n,a) => n+a.deals,0)} deals`;
}
