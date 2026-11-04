import assert from 'node:assert/strict';
import {activeDials,dialProgress,garageProgress,periodOf,goalStreak} from '../src/progression.ts';
import {achievements,availableBanner} from '../src/achievements.ts';
const today='2026-11-04';
const dial=(n:number,method='Hand dial',period='morning',day=today,time='2026-11-04T15:59:00Z')=>({key:'dial_'+Math.random(),data:{delta:n,method,period,day,createdAt:time,goalAtDial:500}});
assert.equal(periodOf({createdAt:'2026-11-04T18:59:00Z'}),'morning');assert.equal(periodOf({createdAt:'2026-11-04T19:00:00Z'}),'morning');
assert.equal(achievements([],today).length,25);assert.equal(new Set(achievements([],today).map(a=>a.name)).size,25);
for(const n of [50,150,250,350,450,550,650,750,850,950]){for(const value of [n-1,n]){assert.equal(achievements([dial(value)],today).find(a=>a.group==='Daily'&&a.target===n)?.unlocked,value>=n)}}
for(const block of ['morning','afternoon'])for(const n of [50,150,250])assert.equal(achievements([dial(n*2,'Wavv',block)],today).find(a=>a.group===block[0].toUpperCase()+block.slice(1)&&a.target===n)?.unlocked,true);
const metric=(metric:string,n:number,day=today)=>({key:'desk_metric_'+Math.random(),data:{metric,delta:n,day,period:'morning',createdAt:day+'T16:00:00Z'}});
assert.equal(achievements([metric('Presentations',4)],today).find(a=>a.title==='Showtime')?.unlocked,true);
assert.equal(achievements([metric('Presentations',4),metric('Appointments set',6)],today).find(a=>a.title==='Ten opportunities')?.unlocked,true);
assert.equal(achievements([metric('Presentations',4),metric('Appointments set',5)],today).find(a=>a.title==='Ten opportunities')?.unlocked,false);
assert.equal(achievements([metric('Presentations',4,'2026-11-03'),metric('Appointments set',6)],today).find(a=>a.title==='Ten opportunities')?.unlocked,false);
assert.equal(achievements([dial(1)],today).find(a=>a.title==='Beat the clock')?.unlocked,true);
assert.equal(achievements([dial(1,'Wavv','morning',today,'2026-11-04T16:00:00Z')],today).find(a=>a.title==='Beat the clock')?.unlocked,false);
const batch=dial(250,'Wavv'),after=dial(250,'Hand dial','afternoon');const reset={key:'desk_dial_reset_test',data:{kind:'dial_reset',eventKeys:[batch.key]}};
assert.deepEqual(dialProgress([batch,after,reset],today),{hand:250,wavv:0,morning:0,afternoon:250});assert.equal(activeDials([batch,after,reset]).length,1);
assert.equal(garageProgress([batch,after],today).xp,375);
assert.equal(achievements([batch,reset],today).filter(a=>a.unlocked).length,0);
assert.equal(dialProgress([batch],'2026-11-05').wavv,0);assert.equal(achievements([batch],'2026-11-05').find(a=>a.group==='Daily'&&a.target===50)?.unlocked,true);
const streakRows=['2026-11-01','2026-11-02','2026-11-03'].map(day=>dial(1000,'Wavv','morning',day,day+'T15:00:00Z'));
assert.equal(goalStreak(streakRows,today).current,3);assert.equal(goalStreak(streakRows,'2026-11-05').current,0);assert.equal(goalStreak(streakRows,'2026-11-05').best,3);
assert.equal(achievements(streakRows,today).find(a=>a.title==='Three-day drive')?.unlocked,true);
console.log('Passed: 25 unique rewards, ten dial boundaries, both blocks, Wavv XP, 4 presentations, combined appointments/presentations same day, before-9 boundary, reset archives, history retention, rollover and streaks.');

assert.equal(periodOf({createdAt:'2026-11-04T19:59:59Z'}),'morning');assert.equal(periodOf({createdAt:'2026-11-04T20:00:00Z'}),'afternoon');assert.equal(periodOf({createdAt:'2026-07-04T19:00:00Z'}),'afternoon');assert.equal(periodOf({createdAt:'2026-11-04T07:00:00Z'}),'morning');console.log('Passed: 1 PM Mountain boundary, daylight saving offset, and midnight.');

assert.equal(availableBanner(0,achievements([],today)),-1,'Locked cars cannot be equipped');
assert.equal(availableBanner(0,achievements([dial(50)],today)),0,'First earned car can be equipped');
assert.equal(availableBanner(1,achievements([dial(50)],today)),-1,'Unearned next car stays locked');
assert.equal(availableBanner(2,achievements([batch,reset],today)),-1,'Corrected achievements remove banner eligibility');
assert.equal(availableBanner(0,achievements([dial(50)],'2026-11-05')),0,'Past achievements remain equipable');
assert.equal(availableBanner(-1,achievements([],today)),-1,'Standard garage is always available');
console.log('Passed: banner car gating, historical unlocks, and reset fallback.');

assert.equal(garageProgress([dial(1,'Wavv')],today).xp,.5);
assert.equal(dialProgress([dial(99,'Wavv')],today).morning,49.5);
assert.equal(achievements([dial(99,'Wavv')],today).find(a=>a.group==='Daily'&&a.target===50)?.unlocked,false);
assert.equal(achievements([dial(100,'Wavv')],today).find(a=>a.group==='Daily'&&a.target===50)?.unlocked,true);
assert.equal(goalStreak([dial(999,'Wavv')],today).goalDays,0);
assert.equal(goalStreak([dial(1000,'Wavv')],today).goalDays,1);
console.log('Passed: half-credit Wavv XP, block totals, car thresholds, and goal streaks.');
