import assert from 'node:assert/strict';
import {inviteHandler,GARAGE_ORIGIN,type InviteDependencies} from '../functions/garage-invite-agent/handler.ts';
const calls:string[]=[];
const deps:InviteDependencies={
 async authenticate(token){if(token==='valid-admin')return {id:'verified-admin',admin:true};if(token==='valid-agent')return {id:'regular-agent',admin:false};return null},
 async prepare(actor,name,email){calls.push(actor+'|'+name+'|'+email);return {mode:email==='existing@example.com'?'existing':'invite',email,name}},
 async generate(){calls.push('generate');return {token:'one-time-test-token',type:'invite'}}
};
const handle=inviteHandler(deps);
function req(token:string|null,body:unknown={name:'New Agent',email:'new@example.com'},origin=GARAGE_ORIGIN){return new Request(GARAGE_ORIGIN,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)})}
assert.equal((await handle(req(null))).status,401);
assert.equal((await handle(req('forged-admin'))).status,401);
assert.equal((await handle(req('valid-agent',{name:'Agent',email:'x@example.com',role:'admin',actor:'verified-admin'}))).status,403);
assert.deepEqual(calls,[],'Unauthorized requests never reach account creation');
for(const origin of [GARAGE_ORIGIN,'null','https://preview.example']){
 const preflight=await handle(new Request(GARAGE_ORIGIN,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,apikey,content-type,x-client-info'}}));
 assert.equal(preflight.status,204,'Browser preflight must not require authentication');
 assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'*');
 assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'),null,'No ambient cookie credentials');
 assert.equal((await handle(req(null,{},origin))).status,401);
 assert.equal((await handle(req('valid-agent',{},origin))).status,403);
}
assert.deepEqual(calls,[],'Preflight and unauthorized requests never provision accounts');
assert.equal((await handle(req('valid-admin',{name:'Agent',email:'invalid'}))).status,400);
const created=await handle(req('valid-admin',{name:'  New Agent  ',email:' New@Example.com ',role:'admin',redirectTo:'https://untrusted.example'}));
assert.equal(created.status,200);const result=await created.json();
assert.equal(result.url,GARAGE_ORIGIN+'/accept-invite#invite_token=one-time-test-token&invite_type=invite');
assert.deepEqual(calls,['verified-admin|New Agent|new@example.com','generate']);
assert.equal(created.headers.get('Cache-Control'),'no-store');
assert.equal(created.headers.get('Access-Control-Allow-Origin'),'*');
calls.length=0;
const existing=await (await handle(req('valid-admin',{name:'Existing Agent',email:'existing@example.com'}))).json();
assert.equal(existing.url,GARAGE_ORIGIN+'/');
assert.equal(existing.kind,'existing');
assert(!calls.includes('generate'),'Admins never receive sign-in tokens for existing confirmed users');
const broken=inviteHandler({...deps,generate:async()=>{throw Error('Invitation service unavailable')}});
assert.equal((await broken(req('valid-admin'))).status,400);
const denied=inviteHandler({...deps,prepare:async()=>{throw Error('Admin access required')}});
assert.equal((await denied(req('valid-admin'))).status,400);
const results=await Promise.all(Array.from({length:50},(_,i)=>handle(req('valid-admin',{name:'Agent '+i,email:`agent${i}@example.com`}))));
assert(results.every(r=>r.status===200),'Isolated invitation requests remain independent');
console.log('Passed: production/opaque/preview preflights, missing/forged tokens, non-admin denial, input validation, fixed destination, existing-account privacy, errors, and 50 independent invitation requests.');
