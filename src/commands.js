import { medal, businessDay, weekStart } from './util.js';

const KIND_WORDS = {
  dial: 'dial', dials: 'dial', d: 'dial', call: 'dial', calls: 'dial',
  pres: 'presentation', press: 'presentation', p: 'presentation',
  presentation: 'presentation', presentations: 'presentation',
  appt: 'presentation', appts: 'presentation',
  deal: 'deal', deals: 'deal', sale: 'deal', sales: 'deal', app: 'deal', apps: 'deal',
};

const LABEL = { dial: 'dials', presentation: 'presentations', deal: 'deals' };

export const HELP = [
  '*T1P Bot*',
  '',
  'name Derek B  - register or rename yourself',
  'dials 25      - log 25 dials (also works: "25 dials")',
  'pres 3        - log 3 presentations',
  'deals 1       - log 1 deal',
  'me            - your numbers today',
  'board         - today\'s standings',
  'week          - this week\'s standings',
  'undo          - remove your last entry today',
  'help          - this message',
].join('\n');

/** Parse a logging message. Returns { kind, amount } or null. */
export function parseLog(text) {
  const t = String(text).trim().toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  let m = t.match(/^([a-z]+)\s+(\d+)$/);   // "dials 25"
  if (m && KIND_WORDS[m[1]]) return { kind: KIND_WORDS[m[1]], amount: Number(m[2]) };
  m = t.match(/^(\d+)\s+([a-z]+)$/);       // "25 dials"
  if (m && KIND_WORDS[m[2]]) return { kind: KIND_WORDS[m[2]], amount: Number(m[1]) };
  m = t.match(/^(\d+)$/);                  // bare number = dials
  if (m) return { kind: 'dial', amount: Number(m[1]) };
  return null;
}

export function fmtBoard(title, rows) {
  if (!rows.length) return `*${title}*\n\nNothing logged yet. Be first.`;
  const body = rows
    .map((r, i) => `${medal(i)} ${r.name} - ${r.deals} deals | ${r.presentations} pres | ${r.dials} dials`)
    .join('\n');
  return `*${title}*\n\n${body}`;
}

export function fmtTotals(name, t) {
  return `*${name} - today*\n${t.dials} dials | ${t.presentations} pres | ${t.deals} deals`;
}

/**
 * Build a message handler bound to a data layer.
 * Returns async ({ from, text, messageId }) => string | {broadcast} | null
 */
export function createHandler(db) {
  return async function handleMessage({ from, text, messageId }) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();
    const day = businessDay();

    const nameMatch = raw.match(/^(?:name|register|im|i'm)\s+(.{1,40})$/i);
    if (nameMatch) {
      const agent = await db.upsertAgent(from, nameMatch[1].trim());
      return `Locked in, *${agent.name}*.\n\n${HELP}`;
    }

    const agent = await db.getAgentByPhone(from);
    if (!agent) return 'You are not registered yet. Send: name Your Name';

    if (lower === 'help' || lower === 'commands') return HELP;

    if (['me', 'today', 'mine'].includes(lower)) {
      return fmtTotals(agent.name, await db.myTotals(agent.id, day));
    }

    if (['board', 'standings', 'leaderboard', 'lb'].includes(lower)) {
      return fmtBoard(`Today - ${day}`, await db.standings(day));
    }

    if (lower === 'week' || lower === 'weekly') {
      const start = weekStart(day);
      return fmtBoard(`Week of ${start}`, await db.standings(start, day));
    }

    if (lower === 'undo') {
      const removed = await db.undoLast(agent.id);
      if (!removed) return 'Nothing to undo today.';
      return `Removed: ${removed.amount} ${LABEL[removed.kind]}.`;
    }

    if (agent.is_admin) {
      const ann = raw.match(/^announce\s+([\s\S]+)$/i);
      if (ann) return { broadcast: ann[1].trim() };
      if (lower === 'roster') {
        const list = await db.activeAgents();
        return `*Roster (${list.length})*\n` + list.map(a => `- ${a.name} (${a.phone})`).join('\n');
      }
    }

    const parsed = parseLog(raw);
    if (parsed) {
      if (parsed.amount < 1 || parsed.amount > 1000) return 'That number looks off. 1 to 1000 per entry.';
      const row = await db.logActivity({
        agentId: agent.id, kind: parsed.kind, amount: parsed.amount,
        rawText: raw, waMsgId: messageId, day,
      });
      if (row === null) return null; // duplicate webhook delivery
      const t = await db.myTotals(agent.id, day);
      return `+${parsed.amount} ${LABEL[parsed.kind]}\n${t.dials} dials | ${t.presentations} pres | ${t.deals} deals today`;
    }

    return 'Did not catch that. Send: help';
  };
}
