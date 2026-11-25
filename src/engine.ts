export type Source = 'order' | 'gateway' | 'bank';
export type RecordKind = 'opened' | 'awaiting' | 'failed' | 'captured' | 'payer_debit' | 'merchant_credit';
export interface Row {
  readonly id: string; readonly source: Source; readonly kind: RecordKind;
  readonly occurred: string; readonly arrived: string; readonly amount?: number;
  readonly reference?: string; readonly detail: string;
}
export interface Case {
  id: string; name: string; scenario: string; order: string; amount: number;
  reference: string; rows: readonly Row[];
}
export interface Claim<S extends string> { status:S; evidence:string[]; note:string; }
export interface Lifecycle {
  order: Claim<'open'|'unknown'>; payment: Claim<'captured'|'unconfirmed'|'unknown'>;
}
export interface Decision extends Lifecycle {
  settlement:Claim<'settled'|'ambiguous'|'unknown'>; duplicates:number; conflicts:string[];
}
export type CaseFacts = Pick<Case,'amount'|'reference'>;
export type EvidenceRoles = {
  investigate: (facts:CaseFacts, rows:readonly Row[])=>Lifecycle;
  verify: (facts:CaseFacts, rows:readonly Row[])=>Decision['settlement'];
};
export type StreamEvent =
  | {runId:string; fixtureId:string; type:'start'; total:number; decision:Decision}
  | {runId:string; fixtureId:string; type:'snapshot'; index:number; decision:Decision}
  | {runId:string; fixtureId:string; type:'complete'|'error'};

const byArrival = (a:Row,b:Row) => a.arrived.localeCompare(b.arrived) || a.id.localeCompare(b.id) || a.occurred.localeCompare(b.occurred);
const byOccurrence = (a:Row,b:Row) => a.occurred.localeCompare(b.occurred) || a.id.localeCompare(b.id);
export const arrivalSequence = (rows:readonly Row[]) => [...rows].sort(byArrival);
// Arrival metadata can differ on a resend, but the underlying source event must not.
const fingerprint = (r:Row) => JSON.stringify([r.source,r.kind,r.occurred,r.amount??null,r.reference??null]);
export function deduplicate(rows:readonly Row[]) {
  const known = new Map<string,Row>(), conflicts = new Set<string>(); let duplicates=0;
  for (const r of arrivalSequence(rows)) {
    const prior=known.get(r.id);
    if (!prior) known.set(r.id,r);
    else if (fingerprint(prior)===fingerprint(r)) duplicates++;
    else conflicts.add(r.id);
  }
  return {rows:[...known.values()].filter(r=>!conflicts.has(r.id)).sort(byOccurrence), duplicates, conflicts:[...conflicts].sort()};
}
const claim = <S extends string>(status:S,note:string,rows:Row[] = []):Claim<S> => ({status,note,evidence:rows.map(r=>r.id)});
const matchingCapture = (f:CaseFacts,r:Row) => r.source==='gateway' && r.kind==='captured' && r.amount===f.amount && r.reference===f.reference;
const matchingCredit = (f:CaseFacts,r:Row) => r.source==='bank' && r.kind==='merchant_credit' && r.amount===f.amount && r.reference===f.reference;
function investigate(f:CaseFacts, rows:readonly Row[]):Lifecycle {
  const opened=rows.find(r=>r.source==='order'&&r.kind==='opened');
  const cap=rows.find(r=>matchingCapture(f,r));
  const detail=rows.findLast(r=>(r.source==='gateway'&&r.kind==='failed')||(r.source==='order'&&r.kind==='awaiting'));
  return {
    order:opened?claim('open','Order exists. Fulfilment was not assessed.',[opened]):claim('unknown','Order record has not arrived.'),
    payment:cap?claim('captured','Gateway capture matches this order’s amount and reference.',[cap]):detail?claim('unconfirmed','The available record does not prove a capture.',[detail]):claim('unknown','No gateway confirmation yet.')
  };
}
function verify(f:CaseFacts, bank:readonly Row[]):Decision['settlement'] {
  const credits=bank.filter(r=>r.kind==='merchant_credit'&&r.amount===f.amount);
  const linked=credits.filter(r=>matchingCredit(f,r));
  if(linked.length===1) return claim('settled','One matching merchant credit supports this settlement.',linked);
  if(linked.length>1||credits.length>1) return claim('ambiguous','More than one credit candidate; the ledger does not identify a unique match.',linked.length>1?linked:credits);
  const debit=bank.find(r=>r.kind==='payer_debit'&&r.reference===f.reference&&r.amount===f.amount);
  return claim('unknown',debit?'A payer debit is not proof of merchant credit.':'No uniquely linked merchant credit in the evidence.',debit?[debit]:credits);
}
export const fixtureRoles:EvidenceRoles={investigate,verify};
/** Trust boundary: future model output is only a proposal. Reconstruct trusted claims from source rows. */
export function decide(f:CaseFacts, raw:readonly Row[], roles:EvidenceRoles=fixtureRoles):Decision {
  const normalized=deduplicate(raw);
  const facts=Object.freeze({amount:f.amount,reference:f.reference});
  const copy=(rs:Row[])=>Object.freeze(rs.map(r=>Object.freeze({...r})));
  const lifecycleRows=normalized.rows.filter(r=>r.source==='order'||r.source==='gateway');
  const bankRows=normalized.rows.filter(r=>r.source==='bank');
  const baseline=investigate(facts,lifecycleRows), expected=verify(facts,bankRows);
  const fallback={order:claim('unknown','Order investigator unavailable.'),payment:claim('unknown','Gateway investigator unavailable.'),settlement:claim('unknown','Settlement verifier unavailable.')} as const;
  const bound=<S extends string>(proposal:Claim<S>|undefined, criterion:Claim<S>, unset:Claim<S>) =>
    proposal && proposal.status===criterion.status && Array.isArray(proposal.evidence) && proposal.evidence.length===criterion.evidence.length && new Set(proposal.evidence).size===proposal.evidence.length && criterion.evidence.every(id=>proposal.evidence.includes(id)) ? criterion : unset;
  let life:Lifecycle|undefined, bank:Decision['settlement']|undefined;
  try {life=roles.investigate(facts,copy(lifecycleRows));} catch { /* Fail closed. */ }
  try {bank=roles.verify(facts,copy(bankRows));} catch { /* Fail closed. */ }
  const order=bound(life?.order,baseline.order,fallback.order);
  const payment=bound(life?.payment,baseline.payment,fallback.payment);
  let settlement=bound(bank,expected,fallback.settlement);
  if(settlement.status==='settled') {
    settlement = payment.status==='captured' && order.status==='open' && !normalized.conflicts.length
      ? {...settlement,evidence:[...payment.evidence,...settlement.evidence]}
      : { status:'unknown', note:'A credit candidate is not enough without both a confirmed order and matching capture, with no conflicting IDs.', evidence:settlement.evidence };
  }
  return {order,payment,settlement,duplicates:normalized.duplicates,conflicts:normalized.conflicts};
}
