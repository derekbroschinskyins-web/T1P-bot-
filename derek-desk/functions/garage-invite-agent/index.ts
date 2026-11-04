import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {corsHeaders} from 'npm:@supabase/supabase-js@2.118.0/cors';
import {inviteHandler} from './handler.ts';
const url=Deno.env.get('SUPABASE_URL')!;
const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(inviteHandler({
 async authenticate(token){
  const {data:{user},error}=await admin.auth.getUser(token);
  if(error||!user)return null;
  const caller=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
  const role=await caller.rpc('t1p_desk_is_admin');
  return {id:user.id,admin:!role.error&&role.data===true};
 },
 async prepare(actor,name,email){
  const {data,error}=await admin.rpc('t1p_desk_prepare_invite',{actor,agent_name:name,agent_email:email});
  if(error)throw Error(error.message);return data;
 },
 async generate(email,name){
  const {data,error}=await admin.auth.admin.generateLink({type:'invite',email,options:{data:{full_name:name}}});
  if(error)throw Error(error.message);
  return {token:data.properties.hashed_token,type:data.properties.verification_type};
 }
},corsHeaders));
