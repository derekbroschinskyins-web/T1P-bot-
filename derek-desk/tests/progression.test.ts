import assert from 'node:assert/strict';
import {activeDials,dialProgress,garageProgress,periodOf,goalStreak} from '../src/progression.ts';
const day='2026-11-02';const dial=(key:string,delta:number,time:string,method='Hand dial')=>({key:'dial_'+key,data:{day,delta,method,createdAt:time}});
const rows=[dial('1',250,'2026-11-02T18:59:00Z'),dial('2',250,'2026-11-02T19:00:00Z'),dial('3',500,'2026-11-02T20:00:00Z','Wavv')];
assert.equal(periodOf(rows[0].data),'morning');assert.equal(periodOf(rows[1].data),'afternoon');assert.deepEqual(dialProgress(rows,day),{hand:500,wavv:500,morning:250,afternoon:750});
assert.equal(garageProgress(rows,day).cars.find(c=>c.id==='revuelto')?.unlocked,true);
const corrected=[...rows,dial('4',-1,'2026-11-02T20:00:00Z')];assert.equal(garageProgress(corrected,day).cars.find(c=>c.id==='revuelto')?.unlocked,true);
assert.equal(garageProgress([rows[2]],day).cars.find(c=>c.id==='lambo')?.unlocked,true);
const leader=(n:number,date:string)=>({key:'desk_leadership_'+n,data:{date}});const leadership=[1,2,3,4,5].map(n=>leader(n,day));
assert.equal(garageProgress(leadership,day).cars.find(c=>c.id==='rs6')?.unlocked,false);assert.equal(garageProgress([...leadership,leader(6,'2026-11-01')],day).leadershipCount,5);
assert.equal(garageProgress([{key:'desk_deal_1',data:{status:'Cancelled'}}],day).xp,0);
assert.equal(garageProgress([],day).rank.name,'Rookie');console.log('Passed: noon boundary, hand-only totals, corrections, unlocks, leadership week, cancelled deals, starting rank.');

const reset={key:'desk_dial_reset_1',data:{kind:'dial_reset',day,eventKeys:rows.map(r=>r.key)}};
const previous={...dial('old',75,'2026-11-01T18:00:00Z'),data:{...dial('old',75,'2026-11-01T18:00:00Z').data,day:'2026-11-01'}};
const business=[{key:'desk_deal_1',data:{status:'Submitted'}},{key:'desk_recruit_1',data:{status:'Onboarded'}},...leadership];
const cleared=[...rows,previous,...business,reset];
assert.deepEqual(dialProgress(cleared,day),{hand:0,wavv:0,morning:0,afternoon:0});
assert.equal(dialProgress(cleared,'2026-11-01').hand,75);
assert.equal(garageProgress(cleared,day).xp,1125);
assert.equal(garageProgress(cleared,day).cars.find(c=>c.id==='lambo')?.unlocked,false);
assert.equal(garageProgress(cleared,day).cars.find(c=>c.id==='rs6')?.unlocked,false);
const afterReset=dial('concurrent',10,'2026-11-02T21:00:00Z');
assert.equal(dialProgress([...cleared,afterReset,reset],day).hand,10);
const secondReset={key:'desk_dial_reset_2',data:{kind:'dial_reset',eventKeys:[afterReset.key]}};
assert.equal(dialProgress([...cleared,afterReset,secondReset],day).hand,0);
assert.equal(activeDials(cleared).length,1);
assert.equal(rows[0].data.delta,250);
console.log('Passed: reset both methods and periods, preserve older days and business XP, recompute unlocks, concurrent dials, repeat resets, retain source events.');

for(const target of [150,250,400,500]){for(const count of [target-1,target]){const g=garageProgress([dial('threshold',count,'2026-11-02T20:00:00Z','Wavv')],day);assert.equal(g.cars.find(c=>c.target===target)?.unlocked,count>=target);assert.equal(g.xp,count)}}
const streakRows=['2026-10-31','2026-11-01','2026-11-02'].map((date,i)=>({key:'dial_streak'+i,data:{day:date,method:'Wavv',delta:250,goalAtDial:250,createdAt:date+'T20:00:00Z'}}));
assert.equal(goalStreak(streakRows,day).current,3);assert.equal(goalStreak(streakRows,'2026-11-03').current,3);assert.equal(goalStreak(streakRows,'2026-11-04').current,0);assert.equal(goalStreak(streakRows,'2026-11-04').best,3);assert.equal(dialProgress(streakRows,'2026-11-03').wavv,0);
console.log('Passed: all four Wavv reward boundaries, Wavv XP, goal-day streaks, missed days, retained badges, daily rollover.');
