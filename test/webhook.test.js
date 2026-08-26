// End-to-end: boots the real HTTP server and fires Meta-shaped webhook payloads.
// Outbound WhatsApp calls are intercepted by stubbing global fetch.
import './setup-env.js';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { makeFakeDb } from './fake-db.js';

const DEREK = '18015550001';
const fakeDb = makeFakeDb([DEREK]);
const sent = [];          // outbound WhatsApp messages
const realFetch = globalThis.fetch;

// Intercept: Graph API sends get recorded; Supabase REST calls get served by fakeDb.
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('graph.facebook.com')) {
    const body = JSON.parse(opts.body);
    if (body.type === 'text') sent.push({ to: body.to, text: body.text.body });
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.stub' }] }), { status: 200 });
  }
  if (u.includes('127.0.0.1:59999')) return serveFakeRest(u, opts);
  return realFetch(url, opts);
};

async function serveFakeRest(u, opts) {
  const url = new URL(u);
  const table = url.pathname.split('/rest/v1/')[1];
  const q = url.searchParams;
  const eq = k => (q.get(k) || '').replace(/^eq\./, '');
  const ok = d => new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } });

  if (table === 'wa_agents') {
    if (opts.method === 'POST') {
      const [row] = JSON.parse(opts.body);
      return ok([await fakeDb.upsertAgent(row.phone, row.name)]);
    }
    if (q.get('phone')) { const a = await fakeDb.getAgentByPhone(eq('phone')); return ok(a ? [a] : []); }
    return ok(await fakeDb.activeAgents());
  }
  if (table === 'wa_activity') {
    if (opts.method === 'POST') {
      const [r] = JSON.parse(opts.body);
      const row = await fakeDb.logActivity({
        agentId: r.agent_id, kind: r.kind, amount: r.amount,
        rawText: r.raw_text, waMsgId: r.wa_msg_id, day: r.day,
      });
      if (row === null) {
        return new Response(JSON.stringify({ code: '23505', message: 'duplicate key' }), { status: 409 });
      }
      return ok([row]);
    }
    if (opts.method === 'DELETE') {
      const id = Number(eq('id'));
      const i = fakeDb._activity.findIndex(r => r.id === id);
      if (i >= 0) fakeDb._activity.splice(i, 1);
      return new Response('', { status: 204 });
    }
    // GET
    const agentId = q.get('agent_id') ? Number(eq('agent_id')) : null;
    const from = (q.get('day') || '').replace(/^(eq|gte)\./, '');
    const rows = fakeDb._activity.filter(r =>
      (agentId === null || r.agent_id === agentId) && (!from || r.day >= from)
    );
    if (q.get('order')?.startsWith('id.desc')) {
      const sortedDesc = [...rows].sort((a, b) => b.id - a.id);
      return ok(sortedDesc.slice(0, Number(q.get('limit') || rows.length)));
    }
    if (q.get('select')?.includes('wa_agents')) {
      return ok(rows.map(r => {
        const a = fakeDb._agents.find(x => x.id === r.agent_id);
        return { ...r, wa_agents: { name: a.name, active: a.active } };
      }));
    }
    return ok(rows);
  }
  return new Response('[]', { status: 200 });
}

const { server } = await import('../src/server.js');
const base = await new Promise(res =>
  server.listen(0, '127.0.0.1', () => res(`http://127.0.0.1:${server.address().port}`))
);
test.after(() => server.close());

function sign(body) {
  return 'sha256=' + crypto.createHmac('sha256', process.env.APP_SECRET).update(body).digest('hex');
}

// A real Meta webhook payload shape.
function inbound(from, text, id) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{
      id: '0',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '18015559999', phone_number_id: '111111' },
          contacts: [{ profile: { name: 'Agent' }, wa_id: from }],
          messages: [{ from, id, timestamp: '1756220000', type: 'text', text: { body: text } }],
        },
      }],
    }],
  });
}

async function post(body, sig = sign(body)) {
  return fetch(`${base}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': sig },
    body,
  });
}

// The server acks before processing, so wait for the reply to land.
async function nextReply(before) {
  for (let i = 0; i < 50; i++) {
    if (sent.length > before) return sent[sent.length - 1];
    await new Promise(r => setTimeout(r, 20));
  }
  throw new Error('no reply sent');
}

test('health endpoint responds', async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});

test('webhook verification handshake returns the challenge', async () => {
  const r = await fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=abc123`);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'abc123');
});

test('wrong verify token is rejected', async () => {
  const r = await fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123`);
  assert.equal(r.status, 403);
});

test('forged signature is rejected', async () => {
  const r = await post(inbound(DEREK, 'dials 25', 'x1'), 'sha256=deadbeef');
  assert.equal(r.status, 401);
});

test('full flow over real webhooks: register, log, board', async () => {
  let n = sent.length;
  await post(inbound(DEREK, 'name Derek B', 'w1'));
  assert.match((await nextReply(n)).text, /Locked in/);

  n = sent.length;
  await post(inbound(DEREK, 'dials 30', 'w2'));
  let r = await nextReply(n);
  assert.equal(r.to, DEREK);
  assert.match(r.text, /\+30 dials/);

  n = sent.length;
  await post(inbound(DEREK, 'deals 1', 'w3'));
  assert.match((await nextReply(n)).text, /30 dials \| 0 pres \| 1 deals today/);

  n = sent.length;
  await post(inbound(DEREK, 'board', 'w4'));
  assert.match((await nextReply(n)).text, /Derek B - 1 deals/);
});

test('replayed webhook (Meta retry) is not double counted', async () => {
  const before = (await fakeDb.myTotals(1)).dials;
  await post(inbound(DEREK, 'dials 30', 'w2')); // same message id as before
  await new Promise(r => setTimeout(r, 200));
  assert.equal((await fakeDb.myTotals(1)).dials, before, 'dials should not change on replay');
});

test('non-text message gets a friendly nudge', async () => {
  const n = sent.length;
  const body = JSON.stringify({
    entry: [{ changes: [{ value: { messages: [{ from: DEREK, id: 'w9', type: 'image', image: { id: '1' } }] } }] }],
  });
  await post(body);
  assert.match((await nextReply(n)).text, /Text only/);
});

test('admin announce fans out to the whole roster', async () => {
  await post(inbound('18015550002', 'name Shane', 'w10'));
  await new Promise(r => setTimeout(r, 150));
  const n = sent.length;
  await post(inbound(DEREK, 'announce Meeting moved to 7:15', 'w11'));
  await new Promise(r => setTimeout(r, 400));
  const fresh = sent.slice(n);
  assert.ok(fresh.some(m => m.to === '18015550002' && /Meeting moved/.test(m.text)), 'Shane got the announcement');
  assert.ok(!fresh.some(m => m.to === DEREK && /^Meeting moved/.test(m.text)), 'sender not echoed the broadcast');
  assert.ok(fresh.some(m => m.to === DEREK && /Sent to 1 agents/.test(m.text)), 'sender got confirmation');
});
