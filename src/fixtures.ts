import type {Case, RecordKind, Row, Source} from './engine.js';
const time=(minute:number)=>`2026-11-18T10:${String(minute).padStart(2,'0')}:00.000Z`;
const base=(short:string, name:string, scenario:string):Case=>({id:short,name,scenario,order:`DEMO-${short.toUpperCase()}`,amount:124900,reference:`REF-DEMO-${short.toUpperCase()}`,rows:[]});
const add=(c:Case,id:string,source:Source,kind:RecordKind,occurred:number,arrived:number,detail:string,ref:string|undefined=c.reference):Row=>({id:`${c.id}-${id}`,source,kind,occurred:time(occurred),arrived:time(arrived),detail,amount:c.amount,reference:ref||undefined});
const open=(c:Case)=>add(c,'o1','order','opened',1,1,'Checkout created a synthetic order for ₹1,249.');
const waiting=(c:Case)=>add(c,'o2','order','awaiting',2,2,'Order system logged that payment confirmation had not arrived.');
const fail=(c:Case,arrival=3)=>add(c,'g1','gateway','failed',3,arrival,'Gateway recorded a failed payment attempt before capture.');
const cap=(c:Case,arrival=7)=>add(c,'g2','gateway','captured',5,arrival,'Gateway captured ₹1,249 on the matching checkout reference.');
const debit=(c:Case)=>add(c,'b1','bank','payer_debit',4,4,'Payer statement shows a debit. It is not a merchant statement.');
const credit=(c:Case,id='b2',ref=c.reference,at=11)=>add(c,id,'bank','merchant_credit',at,at,ref?'Merchant credit ledger records ₹1,249 with this reference.':'Merchant ledger has a ₹1,249 credit without a usable reference.',ref);
const a=base('late','Late confirmation','A failure arrives first. The gateway later confirms capture. The merchant statement is missing.');
const b=base('credit','Merchant credited','A matching merchant credit arrives after gateway capture.');
const c=base('resend','Out-of-order resend','An older failure and a duplicate capture arrive after the successful capture.');
const d=base('debit','Payer debit only','The payer reports a debit, but there is no gateway capture or merchant credit.');
const e=base('tie','Two candidate credits','Two equal-value credits have no usable reference. Amount alone cannot link either.');
export const fixtures:readonly Case[]=[
  {...a,rows:[open(a),waiting(a),fail(a),debit(a),cap(a,12)]},
  {...b,rows:[open(b),waiting(b),cap(b),credit(b)]},
  {...c,rows:[open(c),cap(c),fail(c,9),{...cap(c),arrived:time(10)},credit(c)]},
  {...d,rows:[open(d),waiting(d),debit(d)]},
  {...e,rows:[open(e),cap(e),credit(e,'b2','',11),credit(e,'b3','',12)]}
];
