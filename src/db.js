// Supabase access over PostgREST with plain fetch. No SDK dependency.
import { config } from './config.js';
import { businessDay, weekStart, normalizePhone } from './util.js';

const rest = (p) => `${config.supabaseUrl}/rest/v1/${p}`;

async function api(pathAndQuery, { method = 'GET', body, prefer } = {}) {
  const headers = {
    apikey: config.supabaseKey,
    Authorization: `Bearer ${config.supabaseKey}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(rest(pathAndQuery), {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(json?.message || `Supabase ${res.status}`);
    err.status = res.status;
    err.pgCode = json?.code;
    throw err;
  }
  return json;
}

export async function getAgentByPhone(phone) {
  const rows = await api(`wa_agents?phone=eq.${normalizePhone(phone)}&select=*&limit=1`);
  return rows?.[0] || null;
}

export async function upsertAgent(phone, name) {
  const p = normalizePhone(phone);
  const rows = await api('wa_agents?on_conflict=phone', {
    method: 'POST',
    body: [{ phone: p, name, is_admin: config.adminNumbers.includes(p), active: true }],
    prefer: 'resolution=merge-duplicates,return=representation',
  });
  return rows[0];
}

export async function logActivity({ agentId, kind, amount, rawText, waMsgId, day }) {
  try {
    const rows = await api('wa_activity', {
      method: 'POST',
      body: [{
        agent_id: agentId, kind, amount,
        day: day || businessDay(), raw_text: rawText, wa_msg_id: waMsgId,
      }],
      prefer: 'return=representation',
    });
    return rows[0];
  } catch (e) {
    if (e.pgCode === '23505') return null; // Meta retried a webhook we already counted
    throw e;
  }
}

export async function undoLast(agentId) {
  const rows = await api(
    `wa_activity?agent_id=eq.${agentId}&day=eq.${businessDay()}&select=*&order=id.desc&limit=1`
  );
  const last = rows?.[0];
  if (!last) return null;
  await api(`wa_activity?id=eq.${last.id}`, { method: 'DELETE' });
  return last;
}

export async function myTotals(agentId, day = businessDay()) {
  const rows = await api(`wa_activity?agent_id=eq.${agentId}&day=eq.${day}&select=kind,amount`);
  return tally(rows);
}

export async function standings(fromDay, toDay = fromDay) {
  const rows = await api(
    `wa_activity?day=gte.${fromDay}&day=lte.${toDay}` +
    `&select=kind,amount,agent_id,wa_agents!inner(name,active)&wa_agents.active=is.true`
  );
  const byAgent = new Map();
  for (const r of rows || []) {
    if (!byAgent.has(r.agent_id)) {
      byAgent.set(r.agent_id, { name: r.wa_agents.name, dials: 0, presentations: 0, deals: 0 });
    }
    const row = byAgent.get(r.agent_id);
    if (r.kind === 'dial') row.dials += r.amount;
    else if (r.kind === 'presentation') row.presentations += r.amount;
    else if (r.kind === 'deal') row.deals += r.amount;
  }
  return [...byAgent.values()].sort(
    (a, b) => b.deals - a.deals || b.presentations - a.presentations || b.dials - a.dials
  );
}

export async function activeAgents() {
  return (await api('wa_agents?active=is.true&select=*')) || [];
}

export function tally(rows) {
  const t = { dials: 0, presentations: 0, deals: 0 };
  for (const r of rows || []) {
    if (r.kind === 'dial') t.dials += r.amount;
    else if (r.kind === 'presentation') t.presentations += r.amount;
    else if (r.kind === 'deal') t.deals += r.amount;
  }
  return t;
}

export { businessDay, weekStart };
