export const premiumTiers = [
 {id:'p10',scope:'personal',amount:10000,rank:'Contender',color:'Ice Blue',hex:'#8dccf0'},
 {id:'p20',scope:'personal',amount:20000,rank:'Performer',color:'Emerald',hex:'#65d4ab'},
 {id:'p30',scope:'personal',amount:30000,rank:'Pacesetter',color:'Violet',hex:'#bc9af3'},
 {id:'p40',scope:'personal',amount:40000,rank:'Elite Producer',color:'Crimson',hex:'#f58c98'},
 {id:'p50',scope:'personal',amount:50000,rank:'Apex Producer',color:'Gold',hex:'#e8c36a'},
 {id:'t100',scope:'team',amount:100000,rank:'Team Captain',color:'Orange',hex:'#f5b279'},
 {id:'t200',scope:'team',amount:200000,rank:'Team Commander',color:'Platinum',hex:'#d8deed'},
 {id:'t500',scope:'team',amount:500000,rank:'Empire Builder',color:'Rose Quartz',hex:'#f0a5d6'},
] as const;
export type Approval={owner_id:string;scope:'personal'|'team';month:string;amount:number;revoked:boolean;approved_at:string};
export function premiumProgress(approvals:Approval[]){
 const best={personal:0,team:0};
 for(const a of approvals)if(!a.revoked)best[a.scope]=Math.max(best[a.scope],Number(a.amount)||0);
 const unlocked=premiumTiers.filter(t=>best[t.scope]>=t.amount);
 return {best,unlocked,highest:unlocked.at(-1)};
}
export function selectedPremiumColor(id:string,approvals:Approval[]){return premiumProgress(approvals).unlocked.find(t=>t.id===id)}
