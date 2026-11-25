import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {arrivalSequence,decide} from './build/engine.js';
import {fixtures} from './build/fixtures.js';
const dist=new URL('./dist/',import.meta.url);
const csp="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
const mime={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8'};
const handlers=createServer(async(req,res)=>{
  res.setHeader('Content-Security-Policy',csp);
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.writeHead(405,{allow:'GET'}).end();return;}
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/api/replay'){
    const f=fixtures.find(x=>x.id===url.searchParams.get('fixture'));
    const runId=url.searchParams.get('run');
    if(!f||!runId||!/^[a-z0-9-]{1,64}$/i.test(runId)){res.writeHead(400).end('Invalid replay');return;}
    res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','x-accel-buffering':'no'});
    const send=(payload)=>res.write(`data: ${JSON.stringify({runId,fixtureId:f.id,...payload})}\n\n`);
    const seq=arrivalSequence(f.rows);
    let i=0;
    send({type:'start',total:seq.length,decision:decide(f,[])});
    const tick=setInterval(()=>{
      try{++i; send({type:'snapshot',index:i,decision:decide(f,seq.slice(0,i))});
        if(i===seq.length){clearInterval(tick);send({type:'complete'});res.end();}
      }catch{clearInterval(tick);send({type:'error'});res.end();}
    },410);
    res.on('close',()=>clearInterval(tick));return;
  }
  const path=url.pathname==='/'?'index.html':/^\/assets\/[A-Za-z0-9._-]+\.(css|js)$/.test(url.pathname)?url.pathname.slice(1):'';
  if(!path){res.writeHead(404).end('Not found');return;}
  try{const body=await readFile(new URL(path,dist));res.writeHead(200,{'content-type':mime[path.slice(path.lastIndexOf('.'))]});
    res.end(body);
  }catch{if(!res.headersSent)res.writeHead(404);res.end();}
});
handlers.listen(Number(process.env.PORT??4173),'127.0.0.1',()=>console.log(`Listening on http://127.0.0.1:${handlers.address().port}`));
