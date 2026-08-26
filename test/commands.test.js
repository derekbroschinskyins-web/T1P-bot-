import './setup-env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, parseLog, fmtBoard } from '../src/commands.js';
import { weekStart, businessDay, normalizePhone } from '../src/util.js';
import { makeFakeDb } from './fake-db.js';

const DEREK = '18015550001';
const SHANE = '18015550002';

test('parseLog understands the shorthand people actually type', () => {
  assert.deepEqual(parseLog('dials 25'), { kind: 'dial', amount: 25 });
  assert.deepEqual(parseLog('25 dials'), { kind: 'dial', amount: 25 });
  assert.deepEqual(parseLog('D 40'),     { kind: 'dial', amount: 40 });
  assert.deepEqual(parseLog('pres 3'),   { kind: 'presentation', amount: 3 });
  assert.deepEqual(parseLog('3 appts'),  { kind: 'presentation', amount: 3 });
  assert.deepEqual(parseLog('deals 2'),  { kind: 'deal', amount: 2 });
  assert.deepEqual(parseLog('2 sales'),  { kind: 'deal', amount: 2 });
  assert.deepEqual(parseLog('60'),       { kind: 'dial', amount: 60 });
  assert.deepEqual(parseLog('dials: 25'),{ kind: 'dial', amount: 25 });
  assert.equal(parseLog('how many dials do I need'), null);
  assert.equal(parseLog('board'), null);
});

test('weekStart snaps to Monday', () => {
  assert.equal(weekStart('2026-08-26'), '2026-08-24'); // Wed -> Mon
  assert.equal(weekStart('2026-08-24'), '2026-08-24'); // Mon -> itself
  assert.equal(weekStart('2026-08-30'), '2026-08-24'); // Sun -> prior Mon
});

test('normalizePhone strips formatting', () => {
  assert.equal(normalizePhone('+1 (801) 555-0001'), '18015550001');
});

test('unregistered user is told to register', async () => {
  const h = createHandler(makeFakeDb());
  assert.match(await h({ from: DEREK, text: 'dials 25', messageId: 'm1' }), /not registered/i);
});

test('register, log, and read back totals', async () => {
  const db = makeFakeDb([DEREK]);
  const h = createHandler(db);

  assert.match(await h({ from: DEREK, text: 'name Derek B', messageId: 'm0' }), /Locked in/);
  assert.match(await h({ from: DEREK, text: 'dials 25', messageId: 'm1' }), /\+25 dials/);
  assert.match(await h({ from: DEREK, text: '15 dials', messageId: 'm2' }), /40 dials/);
  assert.match(await h({ from: DEREK, text: 'pres 3',   messageId: 'm3' }), /3 pres/);
  assert.match(await h({ from: DEREK, text: 'deals 1',  messageId: 'm4' }), /1 deals/);

  const me = await h({ from: DEREK, text: 'me', messageId: 'm5' });
  assert.match(me, /Derek B - today/);
  assert.match(me, /40 dials \| 3 pres \| 1 deals/);
});

test('duplicate webhook delivery does not double count', async () => {
  const db = makeFakeDb();
  const h = createHandler(db);
  await h({ from: DEREK, text: 'name Derek', messageId: 'm0' });
  await h({ from: DEREK, text: 'dials 25', messageId: 'same-id' });
  const second = await h({ from: DEREK, text: 'dials 25', messageId: 'same-id' });
  assert.equal(second, null, 'replayed message should produce no reply');
  assert.deepEqual(await db.myTotals(1), { dials: 25, presentations: 0, deals: 0 });
});

test('undo removes only the last entry', async () => {
  const db = makeFakeDb();
  const h = createHandler(db);
  await h({ from: DEREK, text: 'name Derek', messageId: 'a' });
  await h({ from: DEREK, text: 'dials 25', messageId: 'b' });
  await h({ from: DEREK, text: 'pres 3',   messageId: 'c' });
  assert.match(await h({ from: DEREK, text: 'undo', messageId: 'd' }), /Removed: 3 presentations/);
  assert.deepEqual(await db.myTotals(1), { dials: 25, presentations: 0, deals: 0 });
  await h({ from: DEREK, text: 'undo', messageId: 'e' });
  assert.match(await h({ from: DEREK, text: 'undo', messageId: 'f' }), /Nothing to undo/);
});

test('standings rank by deals, then presentations, then dials', async () => {
  const db = makeFakeDb();
  const h = createHandler(db);
  await h({ from: DEREK, text: 'name Derek', messageId: '1' });
  await h({ from: SHANE, text: 'name Shane', messageId: '2' });
  await h({ from: DEREK, text: 'dials 100',  messageId: '3' });
  await h({ from: SHANE, text: 'dials 10',   messageId: '4' });
  await h({ from: SHANE, text: 'deals 1',    messageId: '5' });

  const board = await h({ from: DEREK, text: 'board', messageId: '6' });
  const lines = board.split('\n').filter(l => l.includes(' deals | '));
  assert.match(lines[0], /Shane/, 'deals outrank dials');
  assert.match(lines[1], /Derek/);
  assert.match(board, new RegExp(businessDay()));
});

test('week view includes today', async () => {
  const db = makeFakeDb();
  const h = createHandler(db);
  await h({ from: DEREK, text: 'name Derek', messageId: '1' });
  await h({ from: DEREK, text: 'dials 12', messageId: '2' });
  const week = await h({ from: DEREK, text: 'week', messageId: '3' });
  assert.match(week, /Week of/);
  assert.match(week, /12 dials/);
});

test('admin gets announce and roster, non-admin does not', async () => {
  const db = makeFakeDb([DEREK]);
  const h = createHandler(db);
  await h({ from: DEREK, text: 'name Derek', messageId: '1' });
  await h({ from: SHANE, text: 'name Shane', messageId: '2' });

  assert.deepEqual(
    await h({ from: DEREK, text: 'announce Meeting moved to 7:15', messageId: '3' }),
    { broadcast: 'Meeting moved to 7:15' }
  );
  assert.match(await h({ from: DEREK, text: 'roster', messageId: '4' }), /Roster \(2\)/);

  // Shane is not an admin: these fall through to the fallback reply
  assert.match(await h({ from: SHANE, text: 'announce hi', messageId: '5' }), /Did not catch/);
  assert.match(await h({ from: SHANE, text: 'roster',     messageId: '6' }), /Did not catch/);
});

test('absurd numbers are rejected', async () => {
  const db = makeFakeDb();
  const h = createHandler(db);
  await h({ from: DEREK, text: 'name Derek', messageId: '1' });
  assert.match(await h({ from: DEREK, text: 'dials 99999', messageId: '2' }), /looks off/);
  assert.deepEqual(await db.myTotals(1), { dials: 0, presentations: 0, deals: 0 });
});

test('empty board reads cleanly', () => {
  assert.match(fmtBoard('Today', []), /Nothing logged yet/);
});
