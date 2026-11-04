export const GARAGE_ORIGIN='https://t1p-dereks-desk.netlify.app';
type Identity={id:string;admin:boolean};
type Prepared={mode:'invite'|'existing';email:string;name:string};
type Link={token:string;type:string};
export type InviteDependencies={
 authenticate:(token:string)=>Promise<Identity|null>;
 prepare:(actor:string,name:string,email:string)=>Promise<Prepared>;
 generate:(email:string,name:string)=>Promise<Link>;
};
export function inviteHandler(deps:InviteDependencies){return async(req:Request)=>{
 const headers={'Access-Control-Allow-Origin':GARAGE_ORIGIN,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Content-Type':'application/json','Cache-Control':'no-store'};
 const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
 if(req.headers.has('origin')&&req.headers.get('origin')!==GARAGE_ORIGIN)return reply(403,{error:'This request must come from THE GARAGE.'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,{error:'Use POST.'});
 const auth=req.headers.get('authorization')||'';
 if(!auth.startsWith('Bearer ')||auth.length<10)return reply(401,{error:'Sign in to invite an agent.'});
 try{
  const caller=await deps.authenticate(auth.slice(7));
  if(!caller)return reply(401,{error:'Your session expired. Sign in again.'});
  if(!caller.admin)return reply(403,{error:'Only Derek and Birch can invite agents.'});
  const raw=await req.text();if(raw.length>2048)return reply(400,{error:'Enter only the agent’s name and email.'});
  let body;try{body=JSON.parse(raw)}catch{return reply(400,{error:'Enter a valid name and email.'})}
  const name=typeof body?.name==='string'?body.name.trim():'';
  const email=typeof body?.email==='string'?body.email.trim().toLowerCase():'';
  if(!name||name.length>100||email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))return reply(400,{error:'Enter a valid name and email.'});
  // No caller-supplied roles, IDs, or redirect URLs are accepted.
  const prepared=await deps.prepare(caller.id,name,email);
  if(prepared.mode==='existing')return reply(200,{kind:'existing',name:prepared.name,email:prepared.email,url:GARAGE_ORIGIN+'/',message:'This agent already has an account. Access is ready; send the sign-in link.'});
  const link=await deps.generate(prepared.email,prepared.name);
  if(!link.token||!['invite','signup'].includes(link.type))throw Error('Invite setup failed. Try again.');
  // A fragment keeps the one-time token out of server access logs and referrers.
  const url=GARAGE_ORIGIN+'/accept-invite#'+new URLSearchParams({invite_token:link.token,invite_type:link.type});
  return reply(200,{kind:'invite',name:prepared.name,email:prepared.email,url,message:'Send this private, one-time link to this agent. They’ll choose their own password. Generate a fresh link if it expires.'});
 }catch(e){return reply(400,{error:e instanceof Error?e.message:'Could not create the invitation. Try again.'})}
}}
