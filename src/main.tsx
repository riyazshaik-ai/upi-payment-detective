import React, {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {arrivalSequence,decide} from './engine.js';
import type {Decision,Row,Source,StreamEvent} from './engine.js';
import {fixtures} from './fixtures.js';
import './style.css';

const time = (stamp:string)=>new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'Asia/Kolkata'}).format(new Date(stamp));
const price=(paise:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:paise%100===0?0:2,maximumFractionDigits:2}).format(paise/100);
const lanes:{id:Source;name:string;label:string}[]=[{id:'order',name:'Order system',label:'O'},{id:'gateway',name:'Gateway',label:'G'},{id:'bank',name:'Bank evidence',label:'B'}];
const recordName:Record<Row['kind'],string>={opened:'Order opened',awaiting:'Awaiting payment',failed:'Failed attempt',captured:'Gateway capture',payer_debit:'Payer debit',merchant_credit:'Merchant credit'};
const statusName:Record<string,string>={unknown:'Unknown',captured:'Captured',unconfirmed:'Unconfirmed',open:'Order found',settled:'Settlement confirmed',ambiguous:'Ambiguous'};
type Replay={phase:'idle'|'live'|'done'|'error'; frames:Decision[]; review:number|null};
const idle=():Replay=>({phase:'idle',frames:[],review:null});
function App(){
 const [caseId,setCaseId]=useState(fixtures[0].id), [run,setRun]=useState<Replay>(idle), [focus,setFocus]=useState<string|null>(null);
 const live=useRef<{id:string;stream:EventSource}|null>(null), detailRef=useRef<HTMLElement|null>(null);
 const f=fixtures.find(x=>x.id===caseId)!;
 const track=arrivalSequence(f.rows), steps=Math.max(0,run.frames.length-1), cursor=run.review??steps;
 const decision=run.frames[cursor]??decide(f,[]), visible=track.slice(0,cursor);
 const inspection=visible.find(r=>r.id===focus);
 useEffect(()=>()=>live.current?.stream.close(),[]);
 function stop(){ const old=live.current; live.current=null; old?.stream.close(); }
 function select(next:string){stop();setRun(idle());setFocus(null);setCaseId(next);}
 function replay(){
   stop();setFocus(null);setRun({phase:'live',frames:[],review:null});
   const id=crypto.randomUUID(), stream=new EventSource(`/api/replay?${new URLSearchParams({fixture:f.id,run:id})}`);
   live.current={id,stream};
   const fail=()=>{if(live.current?.id!==id)return;stop();setRun(prev=>({...prev,phase:'error'}));};
   stream.onerror=fail;
   stream.onmessage=({data})=>{
     if(live.current?.id!==id)return;
     let value:StreamEvent; try{value=JSON.parse(data);}catch{fail();return;}
     if(value.runId!==id||value.fixtureId!==f.id)return;
     if(value.type==='error'){fail();return;}
     if(value.type==='start'){setRun(prev=>({...prev,frames:[value.decision]}));return;}
     if(value.type==='snapshot') {setRun(prev=>value.index===prev.frames.length?{...prev,frames:[...prev.frames,value.decision]}:prev);return;}
     if(value.type==='complete'){stop();setRun(prev=>({...prev,phase:prev.frames.length===track.length+1?'done':'error'}));}
   };
 }
 function scrub(position:number){setRun(prev=>({...prev,review:position}));setFocus(null);}
 function inspect(id:string){setFocus(id);requestAnimationFrame(()=>{const e=detailRef.current;if(!e)return;e.focus({preventScroll:true});if(window.matchMedia('(max-width: 1000px)').matches)e.scrollIntoView({block:'nearest'});});}
 const checks=[{title:'Order record',role:'Lifecycle investigator',claim:decision.order},{title:'Payment capture',role:'Lifecycle investigator',claim:decision.payment},{title:'Bank settlement',role:'Settlement verifier',claim:decision.settlement}];
 let seen=new Set<string>();
 const relay=visible.map((r,i)=>{const duplicate=seen.has(r.id)&&!decision.conflicts.includes(r.id);seen.add(r.id);return {r,i,duplicate};});
 return <>
   <header className="mast"><div className="mast-wrap"><div className="brand"><span className="mark" aria-hidden="true"><svg width="21" height="21" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h9M4 17h7M15 15l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></span><span>UPI Payment Detective<small>PORTFOLIO LAB / 01</small></span></div><div className="mode"><span></span> Synthetic data · No-model mode</div></div></header>
   <main>
     <section className="intro"><p className="eyebrow">PAYMENT SUPPORT / EVIDENCE WORKBENCH</p><h1>Follow the evidence.</h1><p>Reconstruct one disputed payment. See what the order, gateway and bank actually prove.</p></section>
     <div className="casebar"><div className="casecopy"><div className="case-meta"><span className="eyebrow">CASE FILE</span><span>{f.order}</span><span>{price(f.amount)}</span></div><h2>{f.name}</h2><p>{f.scenario}</p></div><div className="actions"><label>Scenario<select value={caseId} onChange={e=>select(e.target.value)}>{fixtures.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><button className="run" onClick={replay}><span aria-hidden="true">▶</span> {run.phase==='idle'?'Replay':'Replay again'}</button></div></div>
     <section aria-label="Evidence summary" className="verdicts">{checks.map(x=><article className="verdict" key={x.title}><div className="badge-title">{x.title}</div><div className={'status '+x.claim.status}><i aria-hidden="true"/>{statusName[x.claim.status]}</div><p>{x.claim.note}</p><div className="citations">{x.claim.evidence.map(id=><button key={id} aria-label={`Inspect ${id}`} onClick={()=>inspect(id)}>{id} <span aria-hidden="true">↗</span></button>)}{x.claim.evidence.length===0&&<span>NO CITATION YET</span>}</div><small>{x.role}</small></article>)}</section>
     <div className="workspace">
       <section className="timeline" aria-labelledby="timeline-title"><div className="section-head"><div><p className="eyebrow">SOURCE LANES</p><h2 id="timeline-title">Evidence timeline</h2></div><span role="status" className="run-state">{run.phase==='live'?'Replay running':run.phase==='done'?'Replay complete':run.phase==='error'?'Replay interrupted':'Ready to replay'}</span></div>
       <div className="scrub"><button title="Previous event" aria-label="Previous event" disabled={!cursor} onClick={()=>scrub(cursor-1)}>‹</button><label><span>Arrival order <b>{cursor} / {track.length}</b></span><input type="range" min="0" max={steps||track.length} value={cursor} disabled={!steps} aria-label="Replay cursor" onChange={e=>scrub(Math.min(steps,Number(e.target.value)))}/></label><button title="Next event" aria-label="Next event" disabled={cursor>=steps} onClick={()=>scrub(cursor+1)}>›</button></div>
       <p className="timeline-note">Time shown in IST. Rows are plotted by arrival, not event time.{decision.duplicates>0?` ${decision.duplicates} resend${decision.duplicates===1?'':'s'} ignored.`:''}{decision.conflicts.length>0?' Conflicting IDs excluded from conclusions.':''}</p>
       <div className="lanes">{lanes.map(lane=><div className="lane" key={lane.id}><h3><b aria-hidden="true" className={lane.id}>{lane.label}</b>{lane.name}</h3></div>)}</div>
       {relay.length===0&&<p className="empty timeline-empty">Run the replay to see the first arrival.</p>}
       <ol className="arrivals" aria-label="Records in arrival order">{relay.map(({r,i,duplicate})=><li className="lanes" key={i}>{lanes.map(lane=><div className="slot" key={lane.id}>{r.source===lane.id&&<button onClick={()=>inspect(r.id)} className={`row ${duplicate?'duplicate':''}`} aria-current={r.id===focus&&!duplicate?true:undefined}><span>#{i+1} ARRIVED {time(r.arrived)}</span><strong>{recordName[r.kind]}</strong><small>Event {time(r.occurred)} · {duplicate?'Resend ignored':r.id}</small></button>}</div>)}</li>)}</ol>
       </section>
       <aside ref={detailRef} tabIndex={-1} aria-labelledby="detail-title" className="inspector"><p className="eyebrow">PROVENANCE</p><h2 id="detail-title">Evidence detail</h2>{inspection?<div data-testid="evidence"><span className="pill">{inspection.id}</span><h3>{recordName[inspection.kind]}</h3><p>{inspection.detail}</p><dl><dt>Source</dt><dd>{lanes.find(x=>x.id===inspection.source)?.name}</dd><dt>Event time</dt><dd>{time(inspection.occurred)} IST</dd><dt>First arrival</dt><dd>{time(inspection.arrived)} IST</dd><dt>Reference</dt><dd>{inspection.reference??'Not provided'}</dd><dt>Amount</dt><dd>{inspection.amount==null?'Not provided':price(inspection.amount)}</dd></dl></div>:<p>Select a record or citation to see what that source says.</p>}<div className="boundary"><strong>Proof boundary</strong><p>Gateway capture and payer debit do not establish merchant credit. This demo does not move money.</p></div></aside>
     </div>
     <footer>Synthetic records only. Evidence labels describe this demo, not a bank decision.</footer>
   </main>
 </>;
}
createRoot(document.getElementById('root')!).render(<App/>);
