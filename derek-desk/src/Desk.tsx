import {useEffect,useRef,useState} from 'react';
import {sb} from './api';
import {ArrowRight,LoaderCircle,ShieldCheck} from 'lucide-react';
import SimpleDesk from './SimpleDesk';
import {setMemoryUser} from './Journal';
const pendingInviteKey='garage-invite-setup-user';
export default function Desk(){
 const [inviting]=useState(()=>window.location.pathname==='/accept-invite');
 const [inviteToken]=useState(()=>new URLSearchParams(window.location.hash.slice(1)).get('invite_token')||'');
 const [inviteType]=useState(()=>new URLSearchParams(window.location.hash.slice(1)).get('invite_type')||'');
 const [inviteUser,setInviteUser]=useState(''),[inviteDone,setInviteDone]=useState(false);
 const [recovering,setRecovering]=useState(()=>window.location.pathname==='/reset-password'||window.location.hash.includes('type=recovery'));
 const [newPassword,setNewPassword]=useState(''),[confirmPassword,setConfirmPassword]=useState(''),[resetMessage,setResetMessage]=useState('');
 const [email,setEmail]=useState(''),[account,setAccount]=useState(''),[showLoginIntro,setShowLoginIntro]=useState(false);
 const [auth,setAuth]=useState(false),[password,setPassword]=useState(''),[authBusy,setAuthBusy]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const inviteLock=useRef(false),loadVersion=useRef(0);
 async function load(){
  const version=++loadVersion.current;
  try{
   const {data:{user},error}=await sb.auth.getUser();if(version!==loadVersion.current)return;if(error||!user){setAuth(false);return}
   if(inviting&&sessionStorage.getItem(pendingInviteKey)===user.id){setInviteUser(user.id);setEmail(user.email||'')}
   const joined=await sb.rpc('t1p_desk_join_team');if(version!==loadVersion.current)return;if(joined.error){setError(joined.error.message);setAuth(false);return}
   const {data:member,error:memberError}=await sb.from('t1p_desk_members').select('name,active').eq('id',user.id).single();
   if(version!==loadVersion.current)return;if(memberError||!member?.active){setError('Your team access is not active.');setAuth(false);return}
   const role=await sb.rpc('t1p_desk_is_admin');if(version!==loadVersion.current)return;if(role.error){setError('Could not verify your access. Please refresh.');setAuth(false);return}
   setMemoryUser(user.id,member.name,role.data===true);setAccount(user.id);setError('');setAuth(true);
  }finally{if(version===loadVersion.current)setLoading(false)}
 }
 useEffect(()=>{void load();const {data:{subscription}}=sb.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')setRecovering(true);if(event==='SIGNED_OUT'){loadVersion.current++;setAuth(false);setRecovering(false);setShowLoginIntro(false)}else setTimeout(()=>void load(),0)});return()=>subscription.unsubscribe()},[]);
 async function login(e:any){e.preventDefault();setAuthBusy(true);setError('');try{const {error}=await sb.auth.signInWithPassword({email:email.trim(),password});if(error)throw error;setPassword('');setShowLoginIntro(true);await load()}catch(e:any){setError(e.message)}finally{setAuthBusy(false)}}
 async function acceptInvite(){
  if(inviteLock.current)return;inviteLock.current=true;setAuthBusy(true);setError('');
  try{
   if(!inviteToken||!['invite','signup'].includes(inviteType))throw Error('This invitation is incomplete. Ask Derek or Birch for a fresh link.');
   const {data,error}=await sb.auth.verifyOtp({token_hash:inviteToken,type:inviteType as 'invite'|'signup'});
   if(error||!data.user||!data.session)throw Error('This invitation has expired or was already used. Ask Derek or Birch for a fresh link, or sign in if you already set your password.');
   sessionStorage.setItem(pendingInviteKey,data.user.id);setInviteUser(data.user.id);setEmail(data.user.email||'');
   window.history.replaceState(null,'','/accept-invite');await load();
  }catch(e:any){setError(e.message)}finally{inviteLock.current=false;setAuthBusy(false)}
 }
 async function requestReset(){setAuthBusy(true);setError('');try{const {error}=await sb.auth.resetPasswordForEmail(email.trim(),{redirectTo:window.location.origin+'/reset-password'});if(error)throw error;setResetMessage('Reset email requested. Open the newest email link once.')}catch(e:any){setError(e.message)}finally{setAuthBusy(false)}}
 async function finishReset(e:any){
  e.preventDefault();setError('');if(newPassword!==confirmPassword){setError('Passwords must match.');return}setAuthBusy(true);
  try{
   const {data:{user},error:checkError}=await sb.auth.getUser();if(checkError||!user)throw Error('Open a fresh invitation or password-reset link before saving.');
   if(inviting&&user.id!==inviteUser)throw Error('Your signed-in account changed. Reopen your invitation.');
   const {error}=await sb.auth.updateUser({password:newPassword});if(error)throw error;
   setNewPassword('');setConfirmPassword('');setRecovering(false);setInviteDone(true);sessionStorage.removeItem(pendingInviteKey);
   if(inviting)setShowLoginIntro(true);window.history.replaceState(null,'','/');await load();
  }catch(e:any){setError(e.message)}finally{setAuthBusy(false)}
 }
 const brand=<div className="login-brand garage-wordmark"><strong>THE GARAGE</strong><span>TOP ONE PERCENT</span></div>;
 if(inviting&&!inviteDone&&!inviteUser)return <div className="login-page"><section className="login-card">{brand}<h1>You’re invited.</h1><p>Accept your invitation to set a password and open your own garage.</p>{error&&<p className="error" role="alert">{error}</p>}<button className="primary wide" disabled={authBusy||loading||!inviteToken} onClick={acceptInvite}>{authBusy?'Checking invitation…':'Accept invitation'}</button>{!inviteToken&&<p>Ask Derek or Birch for your personal invitation link.</p>}<a className="text-link" href="/">Already have an account? Sign in</a></section></div>;
 if(recovering||(inviting&&!inviteDone))return <div className="login-page"><form className="login-card" onSubmit={finishReset}>{brand}<h1>{inviting?'Set your password.':'Set your new password.'}</h1><p>{inviting?`Finish setting up your account for ${email}.`:'This updates your existing T1P account used by THE GARAGE.'}</p><label>New password<input type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label><label>Confirm new password<input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></label>{error&&<p className="error" role="alert">{error}</p>}{resetMessage&&<p role="status">{resetMessage}</p>}<button className="primary wide" disabled={authBusy}>{authBusy?'Saving…':inviting?'Save password & open garage':'Save new password'}</button>{!inviting&&<button className="text-button" type="button" disabled={authBusy} onClick={requestReset}>Send a new reset email</button>}<a className="text-link" href="/">Back to sign in</a></form></div>;
 if(!auth)return <div className="login-page"><form className="login-card" onSubmit={login}>{brand}<h1>Everything you’re<br/>building. In one place.</h1><p>Your dials. Your deals. Your recruits.</p><div className="login-divider"/><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username"/></label><label>Password<input value={password} onChange={e=>setPassword(e.target.value)} type="password" required autoComplete="current-password" placeholder="Your T1P account password"/></label>{error&&<div className="error" role="alert">{error}</div>}<button className="primary wide" disabled={authBusy||loading}>{authBusy?<LoaderCircle className="spin" size={16}/>:<ArrowRight size={16}/>} Open the garage</button><p className="access-notice">Access is by invitation. Derek or Birch will send you your access link.</p><button type="button" className="text-button" disabled={authBusy} onClick={requestReset}>Forgot password?</button>{resetMessage&&<p role="status">{resetMessage}</p>}<small><ShieldCheck size={13}/> Your own desk stays private. Admins can see team performance totals.</small></form></div>;
 return <SimpleDesk key={account} showLoginIntro={showLoginIntro} onIntroClosed={()=>setShowLoginIntro(false)}/>;
}
