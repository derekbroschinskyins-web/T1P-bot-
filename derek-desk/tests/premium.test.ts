import assert from 'node:assert/strict';
import {premiumTiers,premiumProgress,selectedPremiumColor,type Approval} from '../src/premium.ts';
const a=(scope:'personal'|'team',amount:number,month='2026-10-01',revoked=false):Approval=>({owner_id:'test',scope,amount,month,revoked,approved_at:'2026-11-04T00:00:00Z'});
assert.equal(premiumProgress([]).unlocked.length,0);
for(const tier of premiumTiers){
 assert(!premiumProgress([a(tier.scope,tier.amount-.01)]).unlocked.some(t=>t.id===tier.id));
 assert(premiumProgress([a(tier.scope,tier.amount)]).unlocked.some(t=>t.id===tier.id));
}
assert.equal(premiumProgress([a('personal',9000),a('personal',9000,'2026-09-01')]).unlocked.length,0,'Separate months do not accumulate');
assert.equal(premiumProgress([a('personal',50000)]).unlocked.length,5);
assert.equal(premiumProgress([a('team',500000)]).unlocked.length,3,'Team totals do not unlock personal tiers');
assert.equal(premiumProgress([a('personal',20000),a('personal',50000,'2026-09-01',true)]).highest?.id,'p20');
assert.equal(premiumProgress([a('personal',50000,'2025-01-01'),a('personal',1000)]).highest?.id,'p50','Highest approved month persists');
assert.equal(premiumProgress([a('personal',50000),a('team',500000)]).unlocked.length,8);
assert.equal(selectedPremiumColor('p50',[a('personal',20000)]),undefined,'Forged color preferences cannot unlock a tier');
assert.equal(selectedPremiumColor('p10',[a('personal',50000)])?.id,'p10','Earlier earned colors remain selectable');
console.log('Premium thresholds, approval revocation, historical best, scope isolation, and color gating passed.');
