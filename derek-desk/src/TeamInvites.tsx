import {useEffect,useRef,useState} from 'react';
import {Copy,UserPlus} from 'lucide-react';
import {sb} from './api';
import {memberIsAdmin} from './Journal';
type InviteResult={kind:'invite'|'existing';name:string;email:string;url:string;message:string};
export default function TeamInvites(){
 const [name,setName]=useState(''),[email,setEmail]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [pending,setPending]=useState<{name:string;email:string}[]>([]),[result,setResult]=useState<InviteResult|null>(null),[copied,setCopied]=useState(false);
 const lock=useRef(false),linkInput=useRef<HTMLInputElement>(null);
 async function refresh(){const r=await sb.from('t1p_desk_invites').select('name,email').order('created_at',{ascending:false});if(r.error)throw r.error;setPending(r.data||[])}
 useEffect(()=>{if(memberIsAdmin)refresh().catch(e=>setError(e.message))},[]);
 async function invite(agentName=name,agentEmail=email){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setResult(null);setCopied(false);
  try{
   const {data,error}=await sb.functions.invoke('garage-invite-agent',{body:{name:agentName,email:agentEmail}});
   if(error){let message=error.message;try{const body=await error.context?.json();if(body?.error)message=body.error}catch{}throw Error(message)}
   if(data?.error||!data?.url)throw Error(data?.error||'No invitation link was returned. Try again.');
   setResult(data);setName('');setEmail('');await refresh();
  }catch(e:any){setError(e.message||'Could not create invitation. Try again.')}finally{lock.current=false;setBusy(false)}
 }
 async function copy(){if(!result)return;try{await navigator.clipboard.writeText(result.url);setCopied(true)}catch{linkInput.current?.focus();linkInput.current?.select();setError('Select and copy the link below. Your browser blocked automatic copying.')}}
 if(!memberIsAdmin)return null;
 return <section className="panel team-invites"><div className="section-head"><div><span className="eyebrow">ADMIN · DEREK &amp; BIRCH</span><h2>Invite a new agent</h2></div><UserPlus size={21}/></div><p className="subtitle">Enter their name and email, create a link, then copy and send it yourself. New agents choose their own password when they open it.</p>
 <form className="note-form team-filters" onSubmit={e=>{e.preventDefault();void invite()}}><label>Agent name<input required maxLength={100} disabled={busy} autoComplete="off" value={name} onChange={e=>setName(e.target.value)}/></label><label>Agent email<input required type="email" maxLength={254} disabled={busy} autoComplete="off" value={email} onChange={e=>setEmail(e.target.value)}/></label><button className="primary" disabled={busy}><UserPlus size={16}/>{busy?'Creating…':'Create invite link'}</button></form>
 {error&&<p className="error" role="alert">{error}</p>}
 {result&&<div className="invite-result" role="status"><strong>{result.kind==='invite'?'Invitation ready':'Access ready'} · {result.name}</strong><p>{result.email}</p><p>{result.message}</p><div className="note-form"><label>{result.kind==='invite'?'Private invitation link':'Sign-in link'}<input ref={linkInput} readOnly value={result.url} onFocus={e=>e.currentTarget.select()}/></label><button className="primary" onClick={copy}><Copy size={15}/>{copied?'Copied':'Copy link'}</button></div></div>}
 <p className="fineprint">Invited agents receive standard access. Only Derek and Birch have admin tools for invitations, team scores, and rank approvals. Personal notes and client details remain private. No email is sent automatically.</p>
 {!!pending.length&&<div className="pending-invites"><h3>Waiting for first sign-in</h3>{pending.map(agent=><div className="pending-invite" key={agent.email}><span><strong>{agent.name}</strong><small>{agent.email}</small></span><button className="outline-button" disabled={busy} onClick={()=>void invite(agent.name,agent.email)}>Create fresh link</button></div>)}</div>}
 </section>
}
