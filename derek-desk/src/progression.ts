import {dayKey} from './strategy.ts';
export function periodOf(data:any){if(data.period==='morning'||data.period==='afternoon')return data.period;const n=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',hour:'numeric',hourCycle:'h23'}).format(new Date(data.createdAt)));return n<13?'morning':'afternoon';}
// Reset receipts archive exactly the dial events the user confirmed. New events
// from another device are never erased by a stale screen or a retried reset.
export function activeDials(rows:any[]) {
 const erased=new Set(rows.filter(r=>r.key.startsWith('desk_dial_reset_')&&r.data.kind==='dial_reset'&&Array.isArray(r.data.eventKeys)).flatMap(r=>r.data.eventKeys));
 return rows.filter(r=>r.key.startsWith('dial_')&&!erased.has(r.key));
}
export function dialProgress(rows:any[],day=dayKey()) {const events=activeDials(rows).filter(r=>r.data.day===day);const sum=(method:string,period?:string)=>Math.max(0,events.filter(r=>r.data.method===method&&(!period||periodOf(r.data)===period)).reduce((s,r)=>s+Number(r.data.delta||0),0));return {hand:sum('Hand dial'),wavv:sum('Wavv'),morning:sum('Hand dial','morning')+sum('Wavv','morning'),afternoon:sum('Hand dial','afternoon')+sum('Wavv','afternoon')};}
export function garageProgress(rows:any[],today=dayKey()){
 const dials=activeDials(rows);const days=[...new Set(dials.map(r=>r.data.day))];const daily=days.map(day=>dialProgress(rows,day));const hand=daily.reduce((s,d)=>s+d.hand,0);
 const deals=rows.filter(r=>r.key.startsWith('desk_deal_')&&r.data.status!=='Cancelled');const recruits=rows.filter(r=>r.key.startsWith('desk_recruit_'));const leaders=rows.filter(r=>r.key.startsWith('desk_leadership_'));
 const monday=new Date(today+'T12:00:00Z');monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));const week=monday.toISOString().slice(0,10);const weekLeaders=leaders.filter(r=>r.data.date>=week&&r.data.date<=today);
 const wavv=daily.reduce((s,d)=>s+d.wavv,0);const xp=hand+wavv+leaders.length*100+deals.length*250+recruits.length*50+recruits.filter(r=>r.data.status==='Onboarded').length*250;
 const ranks=[{name:'Rookie',at:0},{name:'Street Driver',at:500},{name:'Track Contender',at:1500},{name:'Team Captain',at:3500},{name:'Elite Driver',at:7500},{name:'Top One',at:15000}];const rank=[...ranks].reverse().find(r=>xp>=r.at)!;const next=ranks.find(r=>r.at>xp);

 return {xp,rank,next,leadershipCount:weekLeaders.length,leaders,hand};
}

export function goalStreak(rows:any[],today=dayKey()){
 const days=[...new Set(activeDials(rows).map(r=>r.data.day))].filter(day=>day<=today).sort();
 const hits=days.filter(day=>{const p=dialProgress(rows,day);const events=activeDials(rows).filter(r=>r.data.day===day&&r.data.delta>0);const last=events.sort((a,b)=>(a.data.createdAt||'').localeCompare(b.data.createdAt||'')).at(-1);return p.hand+p.wavv>=Number(last?.data.goalAtDial||500)});
 const previous=(day:string)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)};
 let best=0,run=0,last='';for(const day of hits){run=previous(day)===last?run+1:1;best=Math.max(best,run);last=day}
 let current=0,cursor=hits.includes(today)?today:previous(today);while(hits.includes(cursor)){current++;cursor=previous(cursor)}
 return {current,best,goalDays:hits.length,badges:[{name:'First finish',earned:hits.length>=1,detail:'Complete your daily dial goal'},{name:'Three-day drive',earned:best>=3,detail:'3 consecutive goal days'},{name:'Seven-day streak',earned:best>=7,detail:'7 consecutive goal days'},{name:'Unstoppable',earned:best>=30,detail:'30 consecutive goal days'}]};
}
