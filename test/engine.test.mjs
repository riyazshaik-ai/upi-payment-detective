import test from 'node:test';
import assert from 'node:assert/strict';
import {arrivalSequence,decide,deduplicate,fixtureRoles} from '../build/engine.js';
import {fixtures} from '../build/fixtures.js';
const expected={late:['captured','unknown',0],credit:['captured','settled',0],resend:['captured','settled',1],debit:['unconfirmed','unknown',0],tie:['captured','ambiguous',0]};
for(const f of fixtures) test(f.name,()=>{
  const full=decide(f,f.rows);
  assert.equal(full.order.status,'open');
  assert.deepEqual([full.payment.status,full.settlement.status,full.duplicates],expected[f.id]);
  assert.deepEqual(decide(f,[...f.rows].reverse()),full);
  const seq=arrivalSequence(f.rows);
  for(let i=0;i<=seq.length;i++){
    const d=decide(f,seq.slice(0,i)), allowed=new Map(deduplicate(seq.slice(0,i)).rows.map(r=>[r.id,r]));
    for(const claim of [d.order,d.payment,d.settlement]) for(const id of claim.evidence) assert.ok(allowed.has(id));
    if(d.payment.status==='captured') assert.ok(d.payment.evidence.every(id=>allowed.get(id).kind==='captured'));
    if(d.settlement.status==='settled'){
      assert.equal(d.payment.status,'captured');
      const credits=d.settlement.evidence.map(x=>allowed.get(x)).filter(r=>r.kind==='merchant_credit');
      assert.equal(credits.length,1);
      assert.equal(credits[0].reference,f.reference);
      assert.equal(credits[0].amount,f.amount);
    }
  }
});
test('late stale failure cannot roll back a capture',()=>{
  const f=fixtures.find(f=>f.id==='resend');
  assert.deepEqual(arrivalSequence(f.rows).map(r=>r.kind),['opened','captured','failed','captured','merchant_credit']);
  assert.equal(decide(f,arrivalSequence(f.rows).slice(0,3)).payment.status,'captured');
});
test('model-shaped claims fail closed when they cite a debit as a credit, or invent records',()=>{
  const f=fixtures[0];
  const d=decide(f,f.rows,{
    investigate:()=>({order:{status:'open',evidence:['invented'],note:''},payment:{status:'captured',evidence:['invented'],note:''}}),
    verify:()=>({status:'settled',note:'untrusted',evidence:['late-b1']})
  });
  for(const c of [d.order,d.payment,d.settlement]) assert.deepEqual([c.status,c.evidence],['unknown',[]]);
});
test('agent sees only its own source types; verifier errors do not establish settlement',()=>{
  const f=fixtures[1]; let sawLife=false,sawBank=false;
  const d=decide(f,f.rows,{
    investigate:(f,rows)=>{sawLife=rows.length>0&&rows.every(r=>r.source!=='bank');return fixtureRoles.investigate(f,rows);},
    verify:(_,rows)=>{sawBank=rows.length>0&&rows.every(r=>r.source==='bank');throw new Error('synthetic failure');}
  });
  assert.ok(sawLife&&sawBank); assert.equal(d.settlement.status,'unknown'); assert.equal(d.payment.status,'captured');
});
test('conflicting rows with the same ID and unmatched merchant credit are not settlement proof',()=>{
  const f=fixtures[1], credit=f.rows.find(r=>r.kind==='merchant_credit');
  const d=decide(f,[...f.rows,{...credit,reference:'OTHER'}]);
  assert.deepEqual(d.conflicts,[credit.id]);assert.equal(d.settlement.status,'unknown');
  assert.equal(decide(f,f.rows.map(r=>r.id===credit.id?{...r,amount:r.amount+1}:r)).settlement.status,'unknown');
  assert.equal(decide(f,f.rows.filter(r=>r.kind!=='captured')).settlement.status,'unknown');
});
