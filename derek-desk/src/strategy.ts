export type Lead = { id:string; name:string; kind?:string; phone?:string; email?:string; state?:string; source?:string; submittedAt?:string; sourceRow?:number; sparkId?:string; sourceStage?:string; stage?:string; nextStep?:string; nextAt?:string; suppression?:string; permission?:string; updatedAt?:string; lastNote?:string };
export type Entry = {id:string; leadId:string; text:string; type:string; amount?:number; appointmentAt?:string; nextStep?:string; nextAt?:string; createdAt:string; source:string; kind?:string};
export function dayKey(date=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(date)}
export function blocked(l:Lead){return !!l.suppression || /closed|lost\/dnc|do not call|opt(?:ed)?[ -]?out|not interested|sold/i.test(l.sourceStage||'') || ['closed','do_not_contact'].includes(l.stage||'')}
export function actionFor(l:Lead,now=Date.now()){
 if(blocked(l))return {rank:-1,label:'Do not contact',reason:l.suppression||l.sourceStage||'Closed',kind:'hold'};
 if((!l.kind||l.kind==='sales')&&(!l.phone || l.phone.replace(/\D/g,'').length!==10))return {rank:1,label:'Review phone number',reason:'A usable phone is missing.',kind:'review'};
 if(l.nextStep)return {rank:l.nextAt&&new Date(l.nextAt).getTime()<=now?100:l.nextAt?15:80,label:l.nextStep,reason:l.nextAt?'Your saved follow-up':'Your saved next step',kind:l.nextAt&&new Date(l.nextAt).getTime()<=now?'due':'followup'};
 if(l.kind==='team')return {rank:10,label:'Plan the next coaching check-in',reason:'Review progress and agree one action.',kind:'team'};
 if(l.kind==='recruit')return {rank:50,label:l.stage==='contracting'?'Check contracting progress':l.stage==='licensed'?'Agree the onboarding step':'Confirm interest and book a conversation',reason:'Recruiting follow-up',kind:'recruit'};
 if(['presented','decision'].includes(l.stage||''))return {rank:75,label:'Resolve the open question and agree the decision step',reason:'Closing follow-up',kind:'close'};
 if(l.stage==='submitted')return {rank:55,label:'Check requirements and carrier issue status',reason:'Submitted is not yet issued.',kind:'close'};
 if(l.stage==='issued')return {rank:45,label:'Confirm policy delivery and commission receipt',reason:'Keep issued business and received income separate.',kind:'close'};
 if(l.stage==='booked'||l.sourceStage==='Appointment Booked')return {rank:40,label:'Prepare for the appointment',reason:'Review notes and confirm the agreed time.',kind:'booked'};
 if(l.stage==='warm'||/respond|contacted|follow.?up/i.test(l.sourceStage||''))return {rank:70,label:'Review the conversation and offer two times',reason:'There is previous engagement to pick up.',kind:'warm'};
 return {rank:30,label:'Review eligibility, then make first contact',reason:'Fresh source record. Check Spark restrictions before contacting.',kind:'fresh'};
}
export function suggestion(note:string){
 if(/\b(stop|do not contact|don.t contact|opt out)\b/i.test(note))return 'Review and honor the contact restriction in Spark';
 if(/\b(wife|husband|spouse|partner)\b/i.test(note))return 'Agree a time when both decision makers can join';
 if(/\b(call back|callback|call .*\b(?:monday|tuesday|wednesday|thursday|friday)|reschedul)\b/i.test(note))return 'Confirm the requested callback date and time';
 if(/\b(price|expensive|budget|afford)\b/i.test(note))return 'Clarify the comfortable monthly budget before the next conversation';
 if(/\b(submitted|application)\b/i.test(note))return 'Check the carrier decision; keep submitted and issued business separate';
 return 'Review this note and choose the next specific action';
}
export function metrics(entries:Entry[],now=new Date()){
 const today=dayKey(now),month=today.slice(0,7);const day=entries.filter(e=>dayKey(new Date(e.createdAt))===today);const m=entries.filter(e=>dayKey(new Date(e.createdAt)).startsWith(month));
 return {today,month,booked:new Set(day.filter(e=>e.type==='booking'&&(!e.kind||e.kind==='sales')).map(e=>e.leadId)).size,shows:day.filter(e=>e.type==='show').length,issued:m.filter(e=>e.type==='issued').reduce((s,e)=>s+(e.amount||0),0),team:m.filter(e=>e.type==='team_production').reduce((s,e)=>s+(e.amount||0),0),recruits:new Set(m.filter(e=>e.type==='onboarded').map(e=>e.leadId)).size,income:m.filter(e=>e.type==='commission').reduce((s,e)=>s+(e.amount||0),0),submitted:m.filter(e=>e.type==='sale').reduce((s,e)=>s+(e.amount||0),0)};
}
