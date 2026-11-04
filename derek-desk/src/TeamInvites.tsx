import {useEffect,useRef,useState} from 'react';
import {Copy,UserPlus} from 'lucide-react';
import {sb} from './api';
import {memberIsAdmin} from './Journal';
type InviteResult={kind:'invite'|'existing';name:string;email:string;url:string;message:string};
type AccessRequest={id:string;name:string;email:string;status:string;created_at:string};
const onboardingUrl='https://t1p-dereks-desk.netlify.app/join';
export default function TeamInvites(){
 const [name,setName]=useState(''),[email,setEmail]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [pending,setPending]=useState<{name:string;email:string}[]>([]),[result,setResult]=useState<InviteResult|null>(null),[copied,setCopied]=useState(false);
 const [requests,setRequests]=useState<AccessRequest[]>([]),[sharedCopied,setSharedCopied]=useState(false);
 const lock=useRef(false),linkInput=useRef<HTMLInputElement>(null);
 async function refresh(){const results=await Promise.all([sb.from('t1p_desk_invites').select('name,email').order('created_at',{ascending:false}),sb.from('t1p_desk_access_requests').select('id,name,email,status,created_at').eq('status','pending').order('created_at').limit(200)]);for(const r of results)if(r.error)throw r.error;setPending(results[0].data||[]);setRequests(results[1].data as AccessRequest[]||[])}
 useEffect(()=>{if(!memberIsAdmin)return;const run=()=>refresh().catch(e=>setError(e.message));void run();const timer=setInterval(()=>{if(document.visibilityState==='visible')void run()},20000);return()=>clearInterval(timer)},[]);
 async function invite(agentName=name,agentEmail=email,requestId?:string){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setResult(null);setCopied(false);
  try{
   const {data,error}=await sb.functions.invoke('garage-invite-agent',{body:{name:agentName,email:agentEmail}});
   if(error){let message=error.message;try{const body=await error.context?.json();if(body?.error)message=body.error}catch{}throw Error(message)}
   if(data?.error||!data?.url)throw Error(data?.error||'No invitation link was returned. Try again.');
   setResult(data);setName('');setEmail('');if(requestId){const r=await sb.rpc('t1p_desk_review_request',{request_id:requestId,decision:'ready'});if(r.error)throw Error('Your link is ready below, but the request list could not update. '+r.error.message)}await refresh();
  }catch(e:any){setError(e.message||'Could not create invitation. Try again.')}finally{lock.current=false;setBusy(false)}
 }
 async function copy(){if(!result)return;try{await navigator.clipboard.writeText(result.url);setCopied(true)}catch{linkInput.current?.focus();linkInput.current?.select();setError('Select and copy the link below. Your browser blocked automatic copying.')}}
 async function copyShared(){try{await navigator.clipboard.writeText(onboardingUrl);setSharedCopied(true)}catch{setError('Automatic copying was blocked. Select and copy the team onboarding link below.')}}
 async function dismiss(id:string){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const r=await sb.rpc('t1p_desk_review_request',{request_id:id,decision:'dismissed'});if(r.error)throw r.error;await refresh()}catch(e:any){setError(e.message)}finally{lock.current=false;setBusy(false)}}
 if(!memberIsAdmin)return null;
 return <section className="panel team-invites"><div className="section-head"><div><span className="eyebrow">ADMIN · DEREK &amp; BIRCH</span><h2>Onboard your team</h2></div><UserPlus size={21}/></div><div className="shared-onboarding note-form"><h3>One link for the whole team</h3><p>Share this in your team chat. Agents request access with their name and email. Review each request below, create their private invitation, and send that invitation directly to the correct person.</p><label>Team onboarding link<input readOnly value={onboardingUrl} onFocus={e=>e.currentTarget.select()}/></label><button className="outline-button" onClick={()=>void copyShared()}><Copy size={15}/>{sharedCopied?'Copied team link':'Copy team link'}</button></div>
 <div className="access-requests"><div className="section-head"><h3>Access requests · {requests.length}</h3><button className="text-button" disabled={busy} onClick={()=>refresh().catch(e=>setError(e.message))}>Refresh</button></div><p className="fineprint">Names and emails here are self-reported. Confirm the person and address before granting access. Send private setup links individually; only the team onboarding link belongs in the group chat.</p>{requests.length?requests.map(r=><div className="pending-invite" key={r.id}><span><strong>{r.name}</strong><small>{r.email}</small></span><div className="request-actions"><button className="primary" disabled={busy} onClick={()=>void invite(r.name,r.email,r.id)}>Approve &amp; create link</button><button className="text-button" disabled={busy} onClick={()=>void dismiss(r.id)}>Dismiss</button></div></div>):<p className="fineprint">No pending requests. This list refreshes automatically.</p>}</div><h3>Invite someone directly</h3><p className="subtitle">Enter their name and email, create a link, then copy and send it yourself. New agents choose their own password when they open it.</p>
 <form className="note-form team-filters" onSubmit={e=>{e.preventDefault();void invite()}}><label>Agent name<input required maxLength={100} disabled={busy} autoComplete="off" value={name} onChange={e=>setName(e.target.value)}/></label><label>Agent email<input required type="email" maxLength={254} disabled={busy} autoComplete="off" value={email} onChange={e=>setEmail(e.target.value)}/></label><button className="primary" disabled={busy}><UserPlus size={16}/>{busy?'Creating…':'Create invite link'}</button></form>
 {error&&<p className="error" role="alert">{error}</p>}
 {result&&<div className="invite-result" role="status"><strong>{result.kind==='invite'?'Invitation ready':'Access ready'} · {result.name}</strong><p>{result.email}</p><p>{result.message}</p><div className="note-form"><label>{result.kind==='invite'?'Private invitation link':'Sign-in link'}<input ref={linkInput} readOnly value={result.url} onFocus={e=>e.currentTarget.select()}/></label><button className="primary" onClick={copy}><Copy size={15}/>{copied?'Copied':'Copy link'}</button></div></div>}
 <p className="fineprint">Invited agents receive standard access. Only Derek and Birch have admin tools for invitations, team scores, and rank approvals. Personal notes and client details remain private. No email is sent automatically.</p>
 {!!pending.length&&<div className="pending-invites"><h3>Waiting for first sign-in</h3>{pending.map(agent=><div className="pending-invite" key={agent.email}><span><strong>{agent.name}</strong><small>{agent.email}</small></span><button className="outline-button" disabled={busy} onClick={()=>void invite(agent.name,agent.email)}>Create fresh link</button></div>)}</div>}
 </section>
}
