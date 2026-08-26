import http from 'node:http';
import crypto from 'node:crypto';
import { config, assertConfig } from './config.js';
import { createHandler, fmtBoard } from './commands.js';
import { sendText, sendSmart, markRead } from './whatsapp.js';
import * as db from './db.js';
import { businessDay } from './util.js';

const handleMessage = createHandler(db);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > 1_000_000) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function validSignature(rawBody, header) {
  if (!config.appSecret) return true; // skipped when no secret configured
  if (!header) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', config.appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(header), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function broadcast(text, exceptPhone = null) {
  const list = await db.activeAgents();
  let sent = 0;
  for (const a of list) {
    if (a.phone === exceptPhone) continue;
    try { await sendSmart(a.phone, text); sent++; }
    catch (e) { console.error(`[broadcast fail] ${a.name} ${a.phone}: ${e.message}`); }
  }
  return sent;
}

export async function processWebhook(payload) {
  for (const entry of payload?.entry || []) {
    for (const change of entry.changes || []) {
      for (const msg of change.value?.messages || []) {
        if (msg.type !== 'text') {
          await sendText(msg.from, 'Text only for now. Send: help');
          continue;
        }
        const from = msg.from;
        console.log(`[in] ${from}: ${msg.text?.body}`);
        markRead(msg.id).catch(() => {});

        const result = await handleMessage({ from, text: msg.text?.body, messageId: msg.id });
        if (!result) continue;

        if (typeof result === 'object' && result.broadcast) {
          const n = await broadcast(result.broadcast, from);
          await sendText(from, `Sent to ${n} agents.`);
        } else {
          await sendText(from, result);
        }
      }
    }
  }
}

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, day: businessDay() }));
  }

  // Meta webhook verification handshake
  if (req.method === 'GET' && url.pathname === '/webhook') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === config.verifyToken && config.verifyToken) {
      console.log('[webhook] verified');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end(challenge || '');
    }
    res.writeHead(403);
    return res.end('forbidden');
  }

  if (req.method === 'POST' && url.pathname === '/webhook') {
    let raw;
    try { raw = await readBody(req); }
    catch { res.writeHead(413); return res.end(); }

    if (!validSignature(raw, req.headers['x-hub-signature-256'])) {
      console.warn('[webhook] bad signature');
      res.writeHead(401);
      return res.end('bad signature');
    }

    res.writeHead(200); res.end();  // ack fast; Meta retries anything slow

    let payload;
    try { payload = JSON.parse(raw.toString('utf8')); }
    catch { return console.error('[webhook] bad json'); }

    try { await processWebhook(payload); }
    catch (e) { console.error('[webhook error]', e); }
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

// --- daily verdict scheduler (no cron dependency) ---
function partsInTz(date = new Date()) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: config.timezone, hour12: false,
    hour: '2-digit', minute: '2-digit', weekday: 'short',
  }).formatToParts(date);
  const get = t => f.find(p => p.type === t)?.value;
  return { hour: Number(get('hour')) % 24, minute: Number(get('minute')), weekday: get('weekday') };
}

let lastVerdictDay = null;
async function verdictTick() {
  try {
    const { hour, minute, weekday } = partsInTz();
    const day = businessDay();
    if (day === lastVerdictDay) return;
    if (config.verdictWeekdaysOnly && ['Sat', 'Sun'].includes(weekday)) return;
    if (hour < config.verdictHour || (hour === config.verdictHour && minute < config.verdictMinute)) return;

    lastVerdictDay = day;
    const rows = await db.standings(day);
    if (!rows.length) return;
    await broadcast(`${fmtBoard(`Final - ${day}`, rows)}\n\nDay goes to *${rows[0].name}*.`);
    console.log('[verdict] sent');
  } catch (e) {
    console.error('[verdict error]', e);
  }
}

if (process.env.NODE_ENV !== 'test') {
  assertConfig();
  server.listen(config.port, () => {
    console.log(`T1P WhatsApp bot on :${config.port} | tz ${config.timezone} | verdict ${config.verdictHour}:${String(config.verdictMinute).padStart(2,'0')}`);
  });
  setInterval(verdictTick, 60_000);
}
