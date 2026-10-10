import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { dailyWindow, isDue, leaderboard, formatMessage } from '../src/sms/leaderboard.js';
import { runDaily, validateConfig } from '../src/sms/worker.js';
import { readRows } from '../src/sms/data.js';

const roster = [{ id:'a', name:'Alex' }, { id:'b', name:'Bella' }];
test('summer and winter 6 p.m. use Denver DST', () => {
  assert.deepEqual(dailyWindow(new Date('2026-07-06T23:00Z')), { day:'2026-07-06', start:'2026-07-06T06:00:00.000Z', cutoff:'2026-07-07T00:00:00.000Z' });
  assert.deepEqual(dailyWindow(new Date('2026-01-05T23:00Z')), { day:'2026-01-05', start:'2026-01-05T07:00:00.000Z', cutoff:'2026-01-06T01:00:00.000Z' });
});
test('DST transition boundaries resolve independently', () => {
  const spring = dailyWindow(new Date('2026-03-08T20:00Z'));
  const fall = dailyWindow(new Date('2026-11-01T20:00Z'));
  assert.equal(spring.start, '2026-03-08T07:00:00.000Z');
  assert.equal(spring.cutoff, '2026-03-09T00:00:00.000Z');
  assert.equal(fall.start, '2026-11-01T06:00:00.000Z');
  assert.equal(fall.cutoff, '2026-11-02T01:00:00.000Z');
});
test('only same day midnight through inclusive 6 p.m. cutoff', () => {
  const w = dailyWindow(new Date('2026-07-07T00:00Z'));
  const timestamps = ['2026-07-06T05:59:59.999Z',w.start,w.cutoff,'2026-07-07T00:00:00.001Z','2026-07-07T06:00Z'];
  const deals = timestamps.map((created_at,id) => ({id,created_at,agent_name:'Alex'}));
  assert.equal(leaderboard(roster,deals,w)[0].deals,2);
});
test('schedule at local 18:00 daily, no next-day catchup', () => {
  for (const iso of ['2026-07-07T00:00Z','2026-01-06T01:00Z','2026-03-09T00:00Z','2026-11-02T01:00Z']) assert.ok(isDue(new Date(iso)));
  for (const iso of ['2026-07-06T23:59:59Z','2026-07-07T00:01Z','2026-07-07T01:00Z','2026-07-07T06:00Z']) assert.equal(isDue(new Date(iso)),false);
});
test('roster and explicit aliases only; duplicates, outsiders, zero agents, ties', () => {
  const w = dailyWindow(new Date('2026-07-07T00:00Z'));
  const deals = ['A confirmed','Alex Brown','Bella'].map((agent_name,id) => ({ id,agent_name,created_at:w.start }));
  const rows = leaderboard(roster,[...deals,deals[0]],w,{a:['A confirmed']});
  assert.deepEqual(rows.map(a=>a.deals),[1,1]);
  assert.match(formatMessage(rows,w), /Top Agent by deal count: Alex, Bella \(1\)/);
  assert.match(formatMessage(leaderboard(roster,[],w),w), /None \(0 deals\)/);
  assert.throws(()=>leaderboard(roster,[],w,{b:['Alex']}), /Ambiguous/);
  assert.throws(()=>leaderboard(roster,[],w,{outside:['Other']}), /outside/);
});
test('disabled worker never reads or sends', async () => {
  assert.equal(await runDaily({},new Date('2026-07-07T00:00Z'),()=>{throw Error('network');}),'disabled-or-not-due');
  assert.throws(()=>validateConfig({}),/Missing/);
});
test('pagination retrieves full leaderboard source', async () => {
  const offsets=[];
  const rows=await readRows('https://example.supabase.co','test','deals',{},async url=>{
    const offset=Number(new URL(url).searchParams.get('offset')); offsets.push(offset);
    return {ok:true,json:async()=>Array.from({length:offset===0?1000:1},(_,i)=>({id:offset+i}))};
  });
  assert.equal(rows.length,1001); assert.deepEqual(offsets,[0,1000]);
});
test('query cutoff, Telnyx payload, and durable reservation prevent duplicates', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'t1p-sms-'));
  const env={SMS_ENABLED:'1',T1P_SUPABASE_URL:'https://t1p.example',T1P_SUPABASE_SERVICE_KEY:'test',METRO_SUPABASE_URL:'https://metro.example',METRO_SUPABASE_SERVICE_KEY:'test',TELNYX_API_KEY:'test',TELNYX_FROM_NUMBER:'+18015550001',TELNYX_MESSAGING_PROFILE_ID:'test',SMS_TO_NUMBER:'+18015550002',SMS_STATE_DIR:dir,SMS_ROSTER_ALIASES_VERIFIED:'1',SMS_TELNYX_CONFIG_VERIFIED:'1',SMS_REGISTRATION_VERIFIED:'1'};
  let sends=0;
  const request=async (url,options)=>{
    if(url.includes('/messages')) { sends++; const body=JSON.parse(options.body); assert.match(body.text,/Alex: 1/); return {ok:true}; }
    if(url.includes('/agents?')) return {ok:true,json:async()=>roster};
    const query=new URL(url).searchParams;
    assert.equal(query.get('and'),'(created_at.gte.2026-07-06T06:00:00.000Z,created_at.lte.2026-07-07T00:00:00.000Z)');
    return {ok:true,json:async()=>[{id:1,agent_name:'Alex',created_at:'2026-07-06T12:00Z'}]};
  };
  try {
    assert.equal(await runDaily(env,new Date('2026-07-07T00:00Z'),request),'accepted');
    assert.equal(await runDaily(env,new Date('2026-07-07T00:00:30Z'),request),'already-reserved');
    assert.equal(sends,1);
    assert.equal(await runDaily(env,new Date('2026-07-07T00:01Z'),request),'disabled-or-not-due');
    const unverified={...env,SMS_REGISTRATION_VERIFIED:'0'};
    await assert.rejects(runDaily(unverified,new Date('2026-07-08T00:00Z'),request),/Pending/);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
test('ambiguous Telnyx outcome is reserved across restarts', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'t1p-sms-failed-'));
  const env={SMS_ENABLED:'1',T1P_SUPABASE_URL:'https://t1p.example',T1P_SUPABASE_SERVICE_KEY:'test',METRO_SUPABASE_URL:'https://metro.example',METRO_SUPABASE_SERVICE_KEY:'test',TELNYX_API_KEY:'test',TELNYX_FROM_NUMBER:'+18015550001',TELNYX_MESSAGING_PROFILE_ID:'test',SMS_TO_NUMBER:'+18015550002',SMS_STATE_DIR:dir,SMS_ROSTER_ALIASES_VERIFIED:'1',SMS_TELNYX_CONFIG_VERIFIED:'1',SMS_REGISTRATION_VERIFIED:'1'};
  let sends=0;
  const request=async url=>{
    if(url.includes('/messages')) { sends++; throw new Error('timeout'); }
    return {ok:true,json:async()=>url.includes('/agents?')?roster:[]};
  };
  try {
    await assert.rejects(runDaily(env,new Date('2026-07-07T00:00Z'),request),/timeout/);
    assert.equal(await runDaily(env,new Date('2026-07-07T00:00:30Z'),request),'already-reserved');
    assert.equal(sends,1);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
