import {sb,OWNER} from './api';
export let memoryOwner=OWNER;export let memberName='Derek Broschinsky';
export function setMemoryUser(id:string,name:string){memoryOwner=id;memberName=name;}
const memoryTable=()=>memoryOwner===OWNER?'derek_crm_settings':'t1p_desk_memory';
export type JournalEvent={id:string;at:string;text:string;status:string;nextStep:string;nextDate:string};
export type JournalItem={key:string;version?:string;kind:'deal'|'recruit';name:string;phone:string;date:string;amount:number;carrier:string;status:string;nextStep:string;nextDate:string;events:JournalEvent[];createdAt:string};
export async function readMemory(){const all:any[]=[];for(let offset=0;offset<50000;offset+=500){const {data,error}=await sb.from(memoryTable()).select('key,data,updated_at').eq('owner_id',memoryOwner).or('key.like.desk_%,key.like.dial_%').order('key').range(offset,offset+499);if(error)throw error;all.push(...data);if(data.length<500)return all;}throw Error('Your history is larger than this view can load. Please contact support.');}
function same(a:any,b:any):boolean{if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>same(a[k],b[k]));}
export async function writeMemory(key:string,data:any,version?:string){
 const row={key,owner_id:memoryOwner,data,updated_at:new Date().toISOString()};
 if(version){const {data:saved,error}=await sb.from(memoryTable()).update({data,updated_at:row.updated_at}).eq('key',key).eq('owner_id',memoryOwner).eq('updated_at',version).select('updated_at').maybeSingle();if(error)throw error;if(!saved){const {data:current,error:readError}=await sb.from(memoryTable()).select('data,updated_at').eq('key',key).eq('owner_id',memoryOwner).single();if(readError)throw readError;if(same(current.data,data))return current.updated_at;throw Error('This record changed on another device. Copy your note, then close and reopen it before saving.');}return saved.updated_at;}
 const {error}=await sb.from(memoryTable()).insert(row);if(error){if(error.code==='23505'){const {data:existing,error:readError}=await sb.from(memoryTable()).select('data,updated_at').eq('key',key).eq('owner_id',memoryOwner).single();if(readError)throw readError;if(same(existing.data,data))return existing.updated_at;}throw error;}return row.updated_at;
}
