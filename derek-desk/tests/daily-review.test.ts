import assert from 'node:assert/strict';
import {buildDailyReview} from '../src/dailyReview.ts';
const today='2026-11-04';
const row=(key:string,data:any,updated_at?:string)=>({key,data,updated_at});
const rows=[
 row('desk_dial_goal',{goal:150}),
 row('dial_hand',{day:today,method:'Hand dial',delta:89,period:'morning'}),
 row('dial_wavv',{day:today,method:'Wavv',delta:4,period:'afternoon'}),
 row('dial_erased',{day:today,method:'Hand dial',delta:500,period:'morning'}),
 row('desk_dial_reset_test',{kind:'dial_reset',eventKeys:['dial_erased']}),
 row('dial_old',{day:'2026-11-03',method:'Hand dial',delta:200,period:'morning'}),
 row('desk_metric_a',{day:today,metric:'Presentations',delta:5,period:'morning'}),
 row('desk_metric_b',{day:today,metric:'Presentations',delta:-1,period:'morning'}),
 row('desk_metric_c',{day:today,metric:'Appointments set',delta:2,period:'afternoon'}),
 row('desk_deal_a',{date:today,status:'Submitted',amount:1200,name:'PRIVATE CLIENT',phone:'555-1234',events:[{text:'PRIVATE HISTORY'}]}),
 row('desk_deal_b',{date:today,status:'Cancelled',amount:9000}),
 row('desk_recruit_a',{date:today,name:'PRIVATE RECRUIT'}),
 row('desk_notebook_a',{day:today,text:'Practice my opening',createdAt:'2026-11-04T17:00:00Z'}),
 row('desk_notebook_b',{day:'2026-11-03',text:'OLD NOTE'}),
 row('desk_notepad',{text:'Practice my opening'},'2026-11-04T17:00:00Z')
];
const result=buildDailyReview(rows,today);
for(const expected of ['Hand dials: 89','Raw Wavv dials: 4','Total counted dials: 90⅓','remaining: 59⅔','Morning dials (12 AM–1 PM): 89','Afternoon dials (1 PM–12 AM): 1⅓','Presentations: 4','Appointments set: 2','Submitted: 1 deals / $1,200.00','Recruits added today: 1'])assert.ok(result.includes(expected),expected);
for(const excluded of ['PRIVATE CLIENT','PRIVATE RECRUIT','PRIVATE HISTORY','555-1234','OLD NOTE','$9,000.00'])assert.ok(!result.includes(excluded),excluded);
assert.equal(result.split('Practice my opening').length,2,'deduplicates archived working note');
assert.ok(buildDailyReview([row('desk_notepad',{text:'LAST NIGHT'},'2026-11-04T05:59:00Z')],today).includes('No notes saved'),'Mountain date boundary');
assert.ok(!buildDailyReview([],today).includes('NaN'));
console.log('PASS daily review: exact Wavv thirds, resets, corrections, Mountain dates, notes, and private record exclusion');
