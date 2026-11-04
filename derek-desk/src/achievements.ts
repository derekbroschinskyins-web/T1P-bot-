import {activeDials,dialProgress,goalStreak,dialCredit} from './progression.ts';
import {dayKey} from './strategy.ts';
export const rewardCars=['BMW M3','Lamborghini Huracán','Audi RS 6 Avant','Porsche 911 GT3','Lamborghini Revuelto','Ferrari F8 Tributo','McLaren 720S','Mercedes-AMG GT','Corvette C8','Nissan GT-R','Lamborghini Aventador SVJ','Ferrari 812 Superfast','McLaren P1','Porsche 918 Spyder','Bugatti Chiron','Koenigsegg Jesko','Pagani Huayra','Aston Martin Valkyrie','McLaren Senna','Lamborghini Sián','Ferrari SF90','Porsche Carrera GT','Bugatti Mistral','Mercedes-AMG One','Koenigsegg Regera'];
export function achievements(rows:any[],today=dayKey()){
 const fromDay=rows.find(r=>r.key==='desk_garage_start')?.data?.fromDay;
 // A personal restart changes car eligibility, never the underlying activity history.
 if(typeof fromDay==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(fromDay)&&fromDay<=today){
  rows=rows.filter(r=>r.key.startsWith('desk_dial_reset_')||((r.data.day||r.data.date||'')>=fromDay));
 }
 const dials=activeDials(rows);const days=[...new Set([today,...dials.map(r=>r.data.day),...rows.filter(r=>r.key.startsWith('desk_metric_')||r.key.startsWith('desk_deal_')).map(r=>r.data.day||r.data.date)])].filter(d=>d&&d<=today);
 const sum=(day:string,metric:string)=>Math.max(0,rows.filter(r=>r.key.startsWith('desk_metric_')&&r.data.day===day&&r.data.metric===metric).reduce((s,r)=>s+Number(r.data.delta||0),0));
 const best=(fn:(day:string)=>number)=>Math.max(0,...days.map(fn));const streak=goalStreak(rows,today);
 const specs=[...[50,150,250,350,450,550,650,750,850,950].map((n,i)=>({title:['Ignition','Street pace','Open road','Full throttle','Track ready','Overdrive','Apex hunter','Redline','Supercharged','Hyperdrive'][i],label:n+' dials in one day',group:'Daily',target:n,value:best(day=>{const d=dialProgress(rows,day);return dialCredit(d.hand,d.wavv)})})),
 ...['morning','afternoon'].flatMap(period=>[50,150,250].map((n,i)=>({title:(period==='morning'?'Morning':'Afternoon')+' '+['launch','momentum','domination'][i],label:n+' dials in the '+period+' block',group:period==='morning'?'Morning':'Afternoon',target:n,value:best(day=>dialProgress(rows,day)[period as 'morning'|'afternoon'])}))),
 {title:'Beat the clock',label:'Log your first dial before 9 AM Mountain time',group:'Morning',target:1,value:days.some(day=>{const first=dials.filter(r=>r.data.day===day&&r.data.delta>0).sort((a,b)=>a.data.createdAt.localeCompare(b.data.createdAt))[0];const d=dialProgress(rows,day);return first&&d.hand+d.wavv>0&&Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',hour:'numeric',hourCycle:'h23'}).format(new Date(first.data.createdAt)))<9})?1:0},
 {title:'Showtime',label:'4 presentations in one day',group:'Sales',target:4,value:best(day=>sum(day,'Presentations'))},
 {title:'Ten opportunities',label:'10 presentations + appointments set in one day',group:'Sales',target:10,value:best(day=>sum(day,'Presentations')+sum(day,'Appointments set'))},
 {title:'Calendar loaded',label:'5 appointments set in one day',group:'Sales',target:5,value:best(day=>sum(day,'Appointments set'))},
 {title:'First finish',label:'Log a sold deal',group:'Sales',target:1,value:rows.filter(r=>r.key.startsWith('desk_deal_')&&r.data.status!=='Cancelled').length},
 {title:'Hat trick',label:'Log 3 sold deals in one day',group:'Sales',target:3,value:best(day=>rows.filter(r=>r.key.startsWith('desk_deal_')&&r.data.date===day&&r.data.status!=='Cancelled').length)},
 {title:'Three-day drive',label:'Reach your daily dial goal 3 days in a row',group:'Consistency',target:3,value:streak.best},
 {title:'Week of wins',label:'Reach your daily dial goal 7 days in a row',group:'Consistency',target:7,value:streak.best},
 {title:'Build the drivers',label:'Log 5 leadership actions',group:'Leadership',target:5,value:rows.filter(r=>r.key.startsWith('desk_leadership_')).length}];
 return specs.map((a,i)=>({...a,id:'reward-'+i,name:rewardCars[i],slot:i,unlocked:a.value>=a.target}));
}

export function availableBanner(slot:number,cars:{slot:number;unlocked:boolean}[]){return cars.some(c=>c.slot===slot&&c.unlocked)?slot:-1}
