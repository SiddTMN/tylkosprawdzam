'use strict';
// Synthetic schedules in this file are test fixtures only, never generated live data.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const {generate}=require('../scripts/generate-crypto-calendar.cjs');
const adapter=require('../scripts/crypto-calendar/adapters/ethereum-protocol-calls.cjs');
const M=require('../js/crypto-calendar-model.js');
const now=Date.parse('2026-10-11T12:00:00Z'),verifiedAt=new Date(now).toISOString();
const wrap=body=>'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\n'+body+'\r\nEND:VCALENDAR\r\n';
const event=(uid,title,body,status='CONFIRMED')=>'BEGIN:VEVENT\r\nUID:'+uid+'\r\nSUMMARY:'+title+'\r\nSTATUS:'+status+'\r\n'+body+'\r\nEND:VEVENT';
const main=event('fixture','All Core Devs - Execution','DTSTART:20261015T140000Z\r\nDTEND:20261015T150000Z\r\nRRULE:FREQ=WEEKLY;COUNT=5');
const response=text=>new Response(text,{status:200,headers:{'content-type':'text/calendar',etag:'"test"'}});
async function setup(t){const base=path.join(__dirname,'../docs/crypto-calendar-stage1/.cache');await fs.mkdir(base,{recursive:true});const dir=await fs.mkdtemp(path.join(base,'local-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return {cacheDir:dir,outputPath:path.join(dir,'out.json'),now};}
function row(token='ETH',sourceId='test-source',at='2026-10-15T14:00:00.000Z'){
 return {id:sourceId+':'+at,token,date:M.day(Date.parse(at)),startsAt:at,title:'Test fixture',category:'protocol-meeting',priority:'medium',description:'Test fixture only',sourceId,sourceUrl:'https://example.org/event',verifiedAt};
}
function mock(id='test-source',token='ETH',events=[row(token,id)]){return {id,name:id,url:'https://example.org/'+id,async load(){return {events,verifiedAt,transport:'http-200'};}};}
test('ETH adapter includes only Execution/Consensus and creates its own minimal factual text',()=>{
 const other=event('other','All Core Devs - Testing','DTSTART:20261016T140000Z\r\nDTEND:20261016T150000Z');
 const c=event('consensus','AllCoreDevs Consensus','DTSTART:20261017T140000Z\r\nDTEND:20261017T150000Z\r\nDESCRIPTION:Never copy source description');
 const parsed=adapter.parse(wrap(main+'\r\n'+other+'\r\n'+c),verifiedAt,now);
 assert.equal(parsed.length,5);assert.ok(parsed.every(e=>['AllCoreDevs Execution','AllCoreDevs Consensus'].includes(e.title)));
 assert.ok(parsed.every(e=>e.priority==='medium'&&!JSON.stringify(e).includes('Never copy')));assert.equal(parsed.at(-1).date,'2026-11-05');
});
test('adapter handles moved/cancelled occurrences, duplicate UIDs and five-row selection separately',()=>{
 const moved=event('fixture','All Core Devs - Execution','RECURRENCE-ID:20261022T140000Z\r\nDTSTART:20261023T150000Z\r\nDTEND:20261023T160000Z');
 const cancelled='BEGIN:VEVENT\r\nUID:fixture\r\nRECURRENCE-ID:20261029T140000Z\r\nSTATUS:CANCELLED\r\nEND:VEVENT';
 const p=adapter.parse(wrap([main,main.replace('UID:fixture','UID:second'),moved,cancelled].join('\r\n')),verifiedAt,now);
 // The second UID is a separate series, so its unmodified 22/29 Oct facts remain.
 assert.equal(p.filter(e=>e.date==='2026-10-15').length,1);assert.ok(p.some(e=>e.date==='2026-10-23'));assert.equal(M.selectUpcoming(p,now).length,5);
 const single=adapter.parse(wrap([main,moved,cancelled].join('\r\n')),verifiedAt,now);
 assert.deepEqual(single.map(e=>e.date),['2026-10-15','2026-10-23','2026-11-05']);
});
test('adapter rejects tentative entries and does not manufacture cancelled or missing events',()=>{
 const e=event('tentative','All Core Devs - Consensus','DTSTART:20261015T140000Z\r\nDTEND:20261015T150000Z','TENTATIVE');
 assert.deepEqual(adapter.parse(wrap(e),verifiedAt,now),[]);assert.deepEqual(adapter.parse(wrap(main.replace('STATUS:CONFIRMED','STATUS:CANCELLED')),verifiedAt,now),[]);
 assert.throws(()=>adapter.parse('not ICS',verifiedAt,now));
 const allDay=event('date-only','AllCoreDevs Execution','DTSTART;VALUE=DATE:20261015');
 assert.deepEqual(adapter.parse(wrap(allDay),verifiedAt,now),[]);
});
test('common model uses Warsaw civil boundaries and DST without fixed offsets',()=>{
 const fmt=new Intl.DateTimeFormat('pl-PL',{timeZone:M.TIME_ZONE,hour:'2-digit',minute:'2-digit'});
 assert.equal(fmt.format(Date.parse('2026-10-22T14:00:00Z')),'16:00');assert.equal(fmt.format(Date.parse('2026-10-29T14:00:00Z')),'15:00');
 assert.equal(M.day(Date.parse('2026-10-11T22:30:00Z')),'2026-10-12');
 const last=row('ETH','test-source','2026-11-09T22:30:00.000Z');assert.equal(M.selectUpcoming([last],now).length,1);
 assert.equal(M.selectUpcoming([{...last,id:'outside',date:'2026-11-10',startsAt:'2026-11-09T23:30:00.000Z'}],now).length,0);
});
test('merge de-duplicates cross-source facts, rejects conflicting identity and invalid URLs/dates',()=>{
 const a=row();assert.equal(M.mergeEvents([a,{...a},{...a,id:'alias',sourceId:'second'}]).length,1);
 assert.throws(()=>M.mergeEvents([a,{...a,date:'2026-10-16',startsAt:'2026-10-16T14:00:00.000Z'}]),/Sprzeczne/);
 for(const e of [{...a,sourceUrl:'javascript:alert(1)'},{...a,date:'2026-02-30'},{...a,startsAt:'2026-10-15T14:00:00'},{...a,startsAt:'2026-10-15T24:00:00Z'},{...a,priority:'HIGH'}])assert.throws(()=>M.normalizeEvent(e));
});
test('generator refreshes, uses TTL cache, revalidates ETag, preserves verification on offline reads',async t=>{
 const opts=await setup(t);let calls=0;let request;
 const first=await generate({...opts,fetchImpl:async(u,o)=>{calls++;request=o;return response(wrap(main));}});
 assert.equal(first.events.length,4);assert.equal(calls,1);assert.equal(first.sources[adapter.id].status,'fresh');assert.equal(first.publication.approved,false);
 const second=await generate({...opts,now:now+3600000,fetchImpl:async()=>{throw new Error('TTL should prevent request');}});
 assert.equal(second.requests,0);assert.equal(second.sources[adapter.id].status,'cached');assert.equal(second.events[0].verifiedAt,verifiedAt);
 const third=await generate({...opts,now:now+7*3600000,fetchImpl:async(u,o)=>{calls++;assert.equal(o.headers['If-None-Match'],'"test"');return new Response(null,{status:304});}});
 assert.equal(calls,2);assert.equal(third.events[0].verifiedAt,new Date(now+7*3600000).toISOString());
 const offline=await generate({...opts,now:now+14*3600000,offline:true,fetchImpl:async()=>assert.fail('offline request')});
 assert.equal(offline.sources[adapter.id].status,'stale');assert.equal(offline.events[0].verifiedAt,third.events[0].verifiedAt);
});
test('network failure keeps only future validated events and original verification, then recovery removes stale/cancelled rows',async t=>{
 const opts=await setup(t);await generate({...opts,fetchImpl:async()=>response(wrap(main))});
 const failed=await generate({...opts,now:Date.parse('2026-10-16T12:00:00Z'),force:true,fetchImpl:async()=>{throw new Error('offline');}});
 assert.equal(failed.sources[adapter.id].status,'stale');assert.equal(failed.events.length,3);assert.equal(failed.events[0].verifiedAt,verifiedAt);
 const restored=await generate({...opts,now:Date.parse('2026-10-16T13:00:00Z'),force:true,fetchImpl:async()=>response(wrap(''))});
 assert.deepEqual(restored.events,[]);assert.equal(restored.sources[adapter.id].status,'fresh');
 const failAfterEmpty=await generate({...opts,now:Date.parse('2026-10-16T14:00:00Z'),force:true,fetchImpl:async()=>{throw new Error('offline');}});
 assert.deepEqual(failAfterEmpty.events,[]);assert.equal(failAfterEmpty.sources[adapter.id].status,'stale');
});
test('malformed ICS cannot poison a successful raw cache or normalized fallback',async t=>{
 const opts=await setup(t);await generate({...opts,fetchImpl:async()=>response(wrap(main))});
 const file=path.join(opts.cacheDir,adapter.id+'.json'),before=await fs.readFile(file,'utf8');
 const result=await generate({...opts,now:now+3600000,force:true,fetchImpl:async()=>response('broken ICS')});
 assert.equal(result.events.length,4);assert.equal(result.sources[adapter.id].status,'stale');assert.equal(await fs.readFile(file,'utf8'),before);
});
test('first-run HTTP/JSON/network errors are unavailable, not a verified empty calendar; no retries or bypass',async t=>{
 const opts=await setup(t);
 for(const status of [403,429]){let count=0;const result=await generate({...opts,force:true,fetchImpl:async()=>{count++;return new Response('denied',{status});}});assert.equal(count,1);assert.equal(result.events.length,0);assert.equal(result.sources[adapter.id].status,'unavailable');}
 for(const fetchImpl of [async()=>{throw new Error('network');},async()=>new Response('<html>error</html>',{headers:{'content-type':'text/html'}}),async()=>response('bad')]){const r=await generate({...opts,force:true,fetchImpl});assert.equal(r.sources[adapter.id].status,'unavailable');}
});
test('timeout aborts the source without retrying and response limit is enforced',async t=>{
 const opts=await setup(t);const result=await generate({...opts,timeoutMs:10,fetchImpl:async(u,o)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('test guard')),100);o.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(o.signal.reason);},{once:true});})});assert.equal(result.sources[adapter.id].status,'unavailable');assert.equal(result.requests,1);
 const oversized=await generate({...opts,fetchImpl:async()=>response('x'.repeat(2*1024*1024+1))});assert.match(oversized.sources[adapter.id].error,/2 MiB/);
});
test('corrupt/mismatched normalized cache is not reused; expired records disappear',async t=>{
 const opts=await setup(t);await fs.mkdir(path.join(opts.cacheDir,'local'),{recursive:true});
 await fs.writeFile(path.join(opts.cacheDir,'local',adapter.id+'.last-good.json'),JSON.stringify({id:adapter.id,url:'https://other.test/',verifiedAt,events:[row()]}));
 const bad=await generate({...opts,fetchImpl:async()=>{throw new Error('offline');}});assert.equal(bad.sources[adapter.id].status,'unavailable');
 await generate({...opts,fetchImpl:async()=>response(wrap(main))});
 const expired=await generate({...opts,now:Date.parse('2026-11-10T12:00:00Z'),force:true,fetchImpl:async()=>{throw new Error('offline');}});assert.equal(expired.events.length,0);assert.equal(expired.sources[adapter.id].status,'stale');
});
test('new DOT/XLM/ATH/BONK adapters share one contract; partial failure does not remove healthy events',async t=>{
 const opts=await setup(t),tokens=['ETH','DOT','XLM','ATH','BONK'];const adapters=tokens.map((token,i)=>mock('adapter-'+i,token,[row(token,'adapter-'+i,'2026-10-'+String(15+i).padStart(2,'0')+'T14:00:00.000Z')]));
 const snapshot=await generate({...opts,adapters});assert.deepEqual(snapshot.events.map(e=>e.token),tokens);M.parseSnapshot(snapshot,now);
 adapters[1].load=async()=>{throw new Error('DOT fixture outage');};
 const partial=await generate({...opts,adapters});assert.equal(partial.events.length,5);assert.equal(partial.sources['adapter-1'].status,'stale');assert.equal(partial.sources['adapter-4'].status,'fresh');
});
test('generator globally sorts before limiting to five and retains complete normalized cache',async t=>{
 const opts=await setup(t),list=Array.from({length:8},(_,i)=>row('ETH','test-source','2026-10-'+String(15+i).padStart(2,'0')+'T14:00:00.000Z')).reverse();
 const snapshot=await generate({...opts,adapters:[mock('test-source','ETH',list)]});assert.equal(snapshot.events.length,5);assert.equal(snapshot.events[0].date,'2026-10-15');assert.equal(snapshot.events[4].date,'2026-10-19');
 const cached=JSON.parse(await fs.readFile(path.join(opts.cacheDir,'local/test-source.last-good.json'),'utf8'));assert.equal(cached.events.length,8);
});
test('snapshot validation rejects unsupported structure, missing source and forged freshness',async t=>{
 const opts=await setup(t),snapshot=await generate({...opts,adapters:[mock()]});
 for(const value of [{...snapshot,generatedAt:'2026-10-12T12:00:00Z'},{...snapshot,sources:{}},{...snapshot,events:[{...snapshot.events[0],sourceId:'missing'}]},{...snapshot,events:[{...snapshot.events[0],verifiedAt:'2026-10-11T11:00:00Z'}]}])assert.throws(()=>M.parseSnapshot(value,now));
});

test('known failed refresh remains stale during a subsequent TTL cache read, until real revalidation succeeds',async t=>{
 const opts=await setup(t);await generate({...opts,fetchImpl:async()=>response(wrap(main))});
 const failed=await generate({...opts,now:now+3600000,force:true,fetchImpl:async()=>{throw new Error('network outage');}});assert.equal(failed.sources[adapter.id].status,'stale');
 const cached=await generate({...opts,now:now+2*3600000,fetchImpl:async()=>assert.fail('TTL must avoid another request')});assert.equal(cached.sources[adapter.id].status,'stale');assert.equal(cached.sources[adapter.id].error,'network outage');
 const recovered=await generate({...opts,now:now+3*3600000,force:true,fetchImpl:async()=>new Response(null,{status:304})});assert.equal(recovered.sources[adapter.id].status,'fresh');assert.equal(recovered.sources[adapter.id].error,undefined);
});

test('the reusable ICS parser accepts a new adapter token and its explicit URL policy without changing audit defaults',()=>{
 const {parseIcs,makeWindow}=require('../scripts/crypto-calendar/shared.cjs');
 const src={id:'ath-test-fixture',token:'ATH',pageUrl:'https://example.org/calendar',reuse:'review-required',approveUrl:u=>u==='https://example.org/calendar'};
 const p=parseIcs(wrap(event('ath-fixture','Synthetic test only','DTSTART:20261015T140000Z\r\nDTEND:20261015T150000Z')),verifiedAt,src,makeWindow(now));
 assert.equal(p.events.length,1);assert.equal(p.events[0].token,'ATH');
 assert.throws(()=>parseIcs(wrap(main),verifiedAt,{...src,approveUrl:()=>false},makeWindow(now)),/Invalid normalized/);
});
