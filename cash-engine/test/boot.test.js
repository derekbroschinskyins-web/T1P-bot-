/* Boots index.html in headless Chromium and checks the app actually renders.
   Catches the class of breakage unit tests cannot: a syntax error, a missing
   element id, a render() that throws. Skipped when no Chromium is available. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const CHROME = CANDIDATES.find(p => { try { return existsSync(p); } catch { return false; } });

const PORT = 5199;
let server;

before(async () => {
  if (!CHROME) return;
  server = spawn(process.execPath, [join(root, 'serve.js')], {
    env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore',
  });
  // wait for the port to answer
  for (let i = 0; i < 50; i++) {
    try { await fetch(`http://127.0.0.1:${PORT}/index.html`); return; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('dev server did not start');
});

after(() => { if (server) server.kill(); });

function dumpDom(url) {
  return execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--virtual-time-budget=6000', '--dump-dom', url,
  ], { encoding: 'utf8', timeout: 60000, maxBuffer: 32 * 1024 * 1024 });
}

test('the page boots, renders and locks', { skip: !CHROME && 'no Chromium available' }, () => {
  const dom = dumpDom(`http://127.0.0.1:${PORT}/index.html`);

  // JS ran at all: the lock screen moved off its hardcoded "Loading…" text
  assert.ok(!/id="lockSub">Loading…</.test(dom), 'lock screen never initialised');

  // render() ran: the KPI tiles hold formatted currency, not the static markup
  assert.match(dom, /id="weekAP"[^>]*>\$[\d,]+</, 'week premium tile did not render');
  assert.match(dom, /id="monthAP"[^>]*>\$[\d,]+</, 'month premium tile did not render');

  // the comp grid built its carrier tabs from CARRIERS
  assert.match(dom, /data-c="Mutual of Omaha"/, 'comp grid tabs did not render');
  assert.match(dom, /data-c="American Amicable"/, 'comp grid is missing carriers');

  // the app starts blurred behind the lock, never wide open
  assert.match(dom, /class="app locked"/, 'app was not locked on load');

  // auth wiring is present
  assert.match(dom, /id="signOutBtn"/, 'sign out button missing');
  assert.match(dom, /id="authEmail"/, 'email field missing');
  assert.ok(!/id="pinRow"/.test(dom), 'old PIN row is still in the page');
});

test('no leftover claude.ai bridge calls ship in the bundle', () => {
  const html = execFileSync('cat', [join(root, 'index.html')], { encoding: 'utf8' });
  assert.ok(!html.includes('window.claude'), 'index.html still calls window.claude');
  assert.ok(html.includes('supabase.co'), 'supabase url missing');
});
