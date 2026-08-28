// The Sunday weekly wrap: formatting only — the scheduler itself is time-driven.
import './setup-env.js';

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHeistMessage } from '../src/server.js';

test('heist report names the week, the winner, and the vault link', () => {
  const rows = [
    { name: 'Derek', dials: 120, presentations: 9, deals: 3 },
    { name: 'Austin', dials: 90, presentations: 7, deals: 2 },
  ];
  const msg = buildHeistMessage('2026-08-24', rows);
  assert.match(msg, /THE HEIST REPORT/);
  assert.match(msg, /Week of 2026-08-24/);
  assert.match(msg, /Take of the week goes to \*Derek\*/);
  assert.match(msg, /Austin/);
  assert.match(msg, /https:\/\//);
});
