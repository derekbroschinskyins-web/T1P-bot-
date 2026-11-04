import {useRef,useState} from 'react';
import {Phone,Trophy,Undo2,CheckCircle2,RotateCcw} from 'lucide-react';
import {useWorkBlock} from './useWorkBlock';
import {FinishFilm} from './Cinema';
import {dayKey} from './strategy';
import {writeMemory} from './Journal';
import {activeDials,dialProgress,periodOf,dialCredit,eventCredit} from './progression';
export default function QuickTrack({rows,onSaved,showHistory=true}:{rows:any[];onSaved:()=>Promise<void>;showHistory?:boolean}){
 const [method,setMethod]=useState('Hand dial'),[batch,setBatch]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[burst,setBurst]=useState(0),[pending,setPending]=useState<any>(null),[finish,setFinish]=useState(false);
 const block=useWorkBlock();
 const [resetPreview,setResetPreview]=useState<any>(null);
 const lock=useRef(false);const goalRow=rows.find(r=>r.key==='desk_dial_goal');const goal=Number(goalRow?.data?.goal)||500;const [goalDraft,setGoalDraft]=useState('');const today=dayKey();const dials=activeDials(rows);const daily=dials.filter(r=>r.data.day===today);const handProgress=dialProgress(rows);const total=dialCredit(handProgress.hand,handProgress.wavv);const methodTotal=daily.filter(r=>r.data.method===method).reduce((s,r)=>s+Number(r.data.delta||0),0);const progress=Math.min(100,total/goal*100);
 async function save(event:any){if(lock.current)return;lock.current=true;setBusy(true);setError('');setPending(event);try{await writeMemory(event.key,event.data);setPending(null);setBatch('');if(event.data.kind==='dial_reset'){setFinish(false);setBurst(0);setMessage('Today’s selected dials erased. Ready for a fresh start.');}else if(event.data.delta>0){setBurst(v=>v+1);if(total<goal&&total+eventCredit(event.data)>=goal)setFinish(true);setMessage(total<goal&&total+eventCredit(event.data)>=goal?'Checkered flag. Daily goal reached!':Math.floor((total+eventCredit(event.data))/25)>Math.floor(total/25)?'Gear up. Another 25 dials in the books.':'Saved to your account.');}else setMessage('Correction saved.');await onSaved();}catch(e:any){setError(e.message||'Could not save. Retry below.');}finally{lock.current=false;setBusy(false)}}
 function record(delta:number){
  const createdAt=new Date().toISOString(),day=dayKey(new Date(createdAt));
  const events=activeDials(rows).filter(r=>r.data.day===day&&r.data.method===method);
  const count=events.reduce((s,r)=>s+Number(r.data.delta||0),0);
  if(!Number.isInteger(delta)||!delta||Math.abs(delta)>10000||count+delta<0){setError('Use a whole number. Corrections cannot make your count negative.');return;}
  let period=periodOf({createdAt});
  if(delta<0&&events.filter(r=>periodOf(r.data)===period).reduce((s,r)=>s+Number(r.data.delta||0),0)<Math.abs(delta))period=period==='morning'?'afternoon':'morning';
  save({key:'dial_'+crypto.randomUUID(),data:{day,method,delta,period,goalAtDial:goal,createdAt}});
 }

 function previewReset(){if(lock.current||pending||!daily.length)return;setError('');setResetPreview({key:'desk_dial_reset_'+crypto.randomUUID(),data:{kind:'dial_reset',day:today,eventKeys:daily.map(r=>r.key),hand:handProgress.hand,wavv:handProgress.wavv,createdAt:new Date().toISOString()}});}
 async function changeGoal(e:any,chosen?:number){e?.preventDefault();const n=chosen??Number(goalDraft);if(!Number.isInteger(n)||n<1||n>10000)return;setBusy(true);try{await writeMemory('desk_dial_goal',{goal:n},goalRow?.updated_at);await onSaved();setGoalDraft('');}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 const week=Array.from({length:7},(_,i)=>{const now=new Date();now.setDate(now.getDate()-(6-i));const day=dayKey(now);return {day,total:dialCredit(dialProgress(rows,day).hand,dialProgress(rows,day).wavv)}});
 const disabled=busy||!!pending||!!resetPreview;
 return <div className="dial-workspace"><section className="dial-arena panel compact-dial-tracker">
  <div className="section-head"><div><span className="eyebrow">CALL COCKPIT · TODAY</span><h2>Ignition on.</h2></div><span className="pill">{block==='morning'?'Morning':'Afternoon'} · MT</span></div>
  <div className="dial-layout">
   <div className="dial-progress-column">
    <div className="dial-meter" role="progressbar" aria-label="Daily dial goal" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(total,goal)} aria-valuetext={`${total} of ${goal} dials`}>
     <svg viewBox="0 0 200 200" aria-hidden="true"><circle className="meter-track" cx="100" cy="100" r="89"/><circle className="meter-fill" cx="100" cy="100" r="89" pathLength="100" strokeDasharray={`${progress} 100`} transform="rotate(-90 100 100)"/></svg>
     <div className="meter-value"><strong>{total.toLocaleString()}</strong><span>of {goal.toLocaleString()} dials</span></div>
    </div>
    <div className="compact-blocks" aria-label="Daily dial blocks">{[{id:'morning',name:'Morning',time:'12 AM–1 PM',value:handProgress.morning,target:Math.ceil(goal/2)},{id:'afternoon',name:'Afternoon',time:'1 PM–12 AM',value:handProgress.afternoon,target:Math.floor(goal/2)}].map(p=><div key={p.id} className={block===p.id?'current':''} aria-current={block===p.id?'time':undefined}><span>{p.name}{block===p.id&&<i aria-label="Active block"/>}</span><strong>{p.value}<small> / {p.target}</small></strong><div className="progress"><span style={{width:Math.min(100,p.value/Math.max(1,p.target)*100)+'%'}}/></div><small>{p.time} MT</small></div>)}</div>
   </div>
   <div className="dial-controls">
    <div className="segmented" role="group" aria-label="Dial method">{['Hand dial','Wavv'].map(m=><button key={m} className={m===method?'selected':''} aria-pressed={m===method} disabled={disabled} onClick={()=>setMethod(m)}>{m}</button>)}</div>
    <button className="dial-main" disabled={disabled} onClick={()=>record(1)}><Phone size={22}/> +1 dial</button>
    <div className="dial-batches">{[10,25].map(n=><button key={n} disabled={disabled} onClick={()=>record(n)}>+{n}</button>)}<button disabled={disabled||methodTotal<1} onClick={()=>record(-1)} aria-label="Undo one dial"><Undo2 size={16}/> −1</button></div>
    <form className="note-form compact-batch" onSubmit={e=>{e.preventDefault();record(Number(batch))}}><label htmlFor="dial-batch">Add {method==='Wavv'?'raw Wavv':'hand'} dials<input id="dial-batch" disabled={disabled} type="number" min="1" max="10000" step="1" required placeholder="Enter count" value={batch} onChange={e=>setBatch(e.target.value)}/></label><button className="outline-button" disabled={disabled||!batch}>Add</button></form><p className="dial-method-help">{method==='Wavv'?'Enter the full Wavv count. Each Wavv call counts as ½ dial toward your goal.':'1 hand dial = 1 dial toward your goal.'}</p>
    <p className="goal-remaining"><strong>{Math.max(0,goal-total)} to go.</strong> {total>=goal?'Daily goal reached.':'Keep the momentum.'}</p><p className="dial-save" role="status"><CheckCircle2 size={14}/>{busy?'Saving…':pending?'Not saved — retry below':message||'Saved to your account'}</p>
    {error&&<p className="error" role="alert">{error}</p>}{pending&&<button className="primary" disabled={busy} onClick={()=>save(pending)}>{pending.data.kind==='dial_reset'?'Retry erase dials':'Retry unsaved dials'}</button>}
   </div>
  </div>
  <details className="target-settings"><summary>Daily target <span>{goal.toLocaleString()} dials · Edit</span></summary><div className="goal-presets">{[150,250,400,500].map(n=><button key={n} className={goal===n?'chosen':''} disabled={disabled} onClick={()=>changeGoal(null,n)}>{n}</button>)}</div><form className="note-form compact-batch" onSubmit={changeGoal}><label>Custom target<input type="number" min="1" max="10000" required placeholder={String(goal)} value={goalDraft} onChange={e=>setGoalDraft(e.target.value)}/></label><button className="text-button" disabled={disabled||!goalDraft}>Save</button></form></details>
  <div className="compact-dial-footer"><small>Hand {handProgress.hand} · Wavv {handProgress.wavv} raw (½ dial each)</small><button className="text-button erase-compact" disabled={disabled||!daily.length} onClick={previewReset}><RotateCcw size={11}/> Reset</button></div>
  {resetPreview&&<div className="dial-reset-confirm" role="group" aria-label="Confirm erase dials"><strong>Reset today’s dials?</strong><p>Clear {resetPreview.data.hand} hand dials and {resetPreview.data.wavv} Wavv dials for {resetPreview.data.day} (Mountain time). Your goal and older days stay saved; dial XP and cars recalculate.</p><small>Entries stay archived. Dials added after this confirmation opens are kept.</small><div><button autoFocus className="text-button" onClick={()=>setResetPreview(null)}>Cancel</button><button className="erase-dials" onClick={()=>{const event=resetPreview;setResetPreview(null);void save(event);}}>Reset today’s dials</button></div></div>}
  {finish&&<div className="finish-overlay" role="dialog" aria-modal="true" aria-label="Daily dial goal reached"><div className="finish-card"><Trophy size={48}/><span className="eyebrow">CHECKERED FLAG</span><h2>{goal} dials.<br/>You did the work.</h2><FinishFilm/><p>Your goal is complete and your progress is saved.</p><button className="primary" onClick={()=>setFinish(false)}>Keep the momentum</button></div></div>}
 </section>

 {showHistory&&<details className="panel dial-history-panel" aria-label="Weekly dial history"><summary>Weekly dial history</summary><div className="section-head"><span className="eyebrow">LAST 7 DAYS · DIALS</span><small>{week.reduce((s,w)=>s+w.total,0)} dials</small></div><div className="dial-week" aria-label="Last seven days">{week.map(w=><div key={w.day} className={w.day===today?'today':''}><strong>{w.total}</strong><span>{new Date(w.day+'T12:00:00').toLocaleDateString('en-US',{weekday:'short'})}</span><i style={{height:Math.max(3,Math.min(24,w.total/goal*24))}}/></div>)}</div></details>}
 </div>
}
