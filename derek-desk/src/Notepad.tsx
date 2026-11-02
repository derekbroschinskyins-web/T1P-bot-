import {useEffect,useRef,useState} from 'react';
import {NotebookPen,Check,Save} from 'lucide-react';
import {writeMemory} from './Journal';

const draftKey='derek-desk-notepad-draft';
function draft(){try{return JSON.parse(sessionStorage.getItem(draftKey)||'null')}catch{return null}}
export default function Notepad({row,onSaved}:{row:any;onSaved:()=>Promise<void>}){
 const [text,setText]=useState<string>(()=>draft()?.text??row?.data?.text??'');
 const current=useRef(text),saved=useRef<string>(row?.data?.text||''),version=useRef<string|undefined>(draft()?draft().baseVersion:row?.updated_at),lock=useRef(false);
 const [status,setStatus]=useState(text===saved.current?'Saved':'Draft restored'),[error,setError]=useState(''),[flush,setFlush]=useState(0);
 const [collapsed,setCollapsed]=useState(()=>window.matchMedia('(max-width: 800px)').matches);
 useEffect(()=>{if(!lock.current&&current.current===saved.current&&row?.updated_at!==version.current){saved.current=row?.data?.text||'';version.current=row?.updated_at;current.current=saved.current;setText(saved.current)}},[row?.updated_at]);
 async function save(){
  if(lock.current||current.current===saved.current)return;
  const snapshot=current.current;let succeeded=false;lock.current=true;setStatus('Saving…');setError('');
  try{version.current=await writeMemory('desk_notepad',{text:snapshot},version.current);saved.current=snapshot;succeeded=true;
   if(current.current===snapshot){sessionStorage.removeItem(draftKey);setStatus('Saved')}else{sessionStorage.setItem(draftKey,JSON.stringify({text:current.current,baseVersion:version.current}));setStatus('Unsaved')}
   await onSaved().catch(()=>{});
  }catch(e:any){setStatus('Not saved');setError(e.message||'Could not save. Your draft is still here.')}finally{lock.current=false;if(succeeded&&current.current!==saved.current)setFlush(n=>n+1)}
 }
 useEffect(()=>{if(text===saved.current)return;const timer=setTimeout(()=>{void save()},1000);return()=>clearTimeout(timer)},[text,flush]);
 function edit(value:string){current.current=value;setText(value);setStatus('Unsaved');setError('');try{sessionStorage.setItem(draftKey,JSON.stringify({text:value,baseVersion:version.current}))}catch{}}
 return <section className={'sidebar-notepad '+(collapsed?'notes-collapsed':'')} aria-label="Personal notepad">
  <button className="notepad-heading" onClick={()=>setCollapsed(c=>!c)} aria-expanded={!collapsed}><NotebookPen size={16}/><span>My notepad</span><small>{collapsed?'Open':'Hide'}</small></button>
  <div className="notepad-body"><label className="sr-only" htmlFor="desk-notepad">Personal notes</label><textarea id="desk-notepad" value={text} maxLength={20000} onChange={e=>edit(e.target.value)} onBlur={()=>void save()} placeholder="A thought. A reminder. Your next move…"/><div className="notepad-footer"><span role="status">{status==='Saved'?<Check size={12}/>:null}{status}</span><button disabled={status==='Saving…'||text===saved.current} onClick={()=>void save()}><Save size={12}/> Save</button></div>{error&&<p className="notepad-error" role="alert">{error}</p>}<small className="notepad-hint">Private · Saved to your account</small></div>
 </section>
}
