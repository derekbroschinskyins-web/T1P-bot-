import { businessDay } from '../src/util.js';

export function makeFakeDb(adminPhones = []) {
  const agents = [];
  const activity = [];
  let agentId = 0, actId = 0;

  const norm = p => String(p).replace(/\D/g, '');

  return {
    _agents: agents, _activity: activity,
    async getAgentByPhone(phone) {
      return agents.find(a => a.phone === norm(phone)) || null;
    },
    async upsertAgent(phone, name) {
      const p = norm(phone);
      let a = agents.find(x => x.phone === p);
      if (a) { a.name = name; return a; }
      a = { id: ++agentId, phone: p, name, is_admin: adminPhones.includes(p), active: true };
      agents.push(a);
      return a;
    },
    async logActivity({ agentId, kind, amount, rawText, waMsgId, day }) {
      if (waMsgId && activity.some(r => r.wa_msg_id === waMsgId)) return null;
      const row = { id: ++actId, agent_id: agentId, kind, amount, day: day || businessDay(), raw_text: rawText, wa_msg_id: waMsgId };
      activity.push(row);
      return row;
    },
    async undoLast(agentId) {
      const day = businessDay();
      for (let i = activity.length - 1; i >= 0; i--) {
        if (activity[i].agent_id === agentId && activity[i].day === day) return activity.splice(i, 1)[0];
      }
      return null;
    },
    async myTotals(agentId, day = businessDay()) {
      const t = { dials: 0, presentations: 0, deals: 0 };
      for (const r of activity) {
        if (r.agent_id !== agentId || r.day !== day) continue;
        if (r.kind === 'dial') t.dials += r.amount;
        else if (r.kind === 'presentation') t.presentations += r.amount;
        else if (r.kind === 'deal') t.deals += r.amount;
      }
      return t;
    },
    async standings(fromDay, toDay = fromDay) {
      const map = new Map();
      for (const r of activity) {
        if (r.day < fromDay || r.day > toDay) continue;
        const a = agents.find(x => x.id === r.agent_id);
        if (!a?.active) continue;
        if (!map.has(a.id)) map.set(a.id, { name: a.name, dials: 0, presentations: 0, deals: 0 });
        const row = map.get(a.id);
        if (r.kind === 'dial') row.dials += r.amount;
        else if (r.kind === 'presentation') row.presentations += r.amount;
        else if (r.kind === 'deal') row.deals += r.amount;
      }
      return [...map.values()].sort(
        (a, b) => b.deals - a.deals || b.presentations - a.presentations || b.dials - a.dials
      );
    },
    async activeAgents() { return agents.filter(a => a.active); },
  };
}
