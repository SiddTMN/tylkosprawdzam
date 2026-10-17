'use strict';
// Synthetic schedules here exercise failure modes; live proof is separate in docs/.../stage2.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const xlm=require('../scripts/crypto-calendar/adapters/stellar-events.cjs');
const eth=require('../scripts/crypto-calendar/adapters/ethereum-protocol-calls.cjs');
const M=require('../js/crypto-calendar-model.js');
const {generate}=require('../scripts/generate-crypto-calendar.cjs');
const {authorize,updateScheduled}=require('../scripts/update-crypto-calendar.cjs');
const now=Date.parse('2026-10-12T12:00:00Z'),verifiedAt=new Date(now).toISOString();
const card=(patch={})=>({_type:'eventCard',_key:'meridian',title:'Meridian 2026',startDate:'2026-10-28',endDate:'2026-10-29',ctas:[{href:'https://meridian.stellar.org'}],...patch});
const html=(rows=[card()],patch={})=>'<script type="application/json" id="__NEXT_DATA__">'+JSON.stringify({props:{pageProps:{url:'https://stellar.org/events',content:[{_type:'cardsSection',items:rows}],...patch}}})+'</script>';
const response=body=>new Response(body,{headers:{'content-type':'text/html; charset=utf-8',etag:'"xlm-fixture"'}});
const fixture=(token,i,patch={})=>({id:token+':'+i,token,date:'2026-10-'+String(13+i).padStart(2,'0'),startsAt:null,title:token+' fixture '+i,category:'protocol-meeting',priority:'medium',description:'Fixture only',sourceId:token==='ETH'?eth.id:xlm.id,sourceUrl:'https://stellar.org/events',verifiedAt,...patch});
async function setup(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'xlm-calendar-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return {now,cacheDir:dir,outputPath:path.join(dir,'preview.json'),localTest:true};}
test('Meridian preserves inclusive source end, no guessed UTC midnight, and original clock labels',()=>{
 const e=xlm.parse(html([card({startTime:'13:00 PST',body:'Do not copy this lengthy publisher description.'})]),verifiedAt,now)[0];
 assert.equal(e.date,'2026-10-28');assert.equal(e.endDate,'2026-10-29');assert.equal(e.endDateExclusive,'2026-10-30');assert.equal(e.startsAt,null);assert.equal(e.endsAt,null);assert.equal(e.sourceStartTime,'13:00 PST');assert.doesNotMatch(e.description,/Do not copy/);assert.equal(e.priority,'high');M.normalizeEvent(e);
});
test('HackMeridian needs a real dated Hub record; pastEvents, menus and prose are not injected',()=>{
 const rows=[card(),card({_key:'hack',title:'HackMeridian 2026',startDate:'2026-10-25',endDate:'2026-10-26',ctas:[{href:'https://meridian.stellar.org/hackmeridian'}]})];
 const p=xlm.parse(html(rows,{headerData:{event:card({_key:'menu'})}}),verifiedAt,now);assert.equal(p.length,2);assert.equal(p[0].category,'hackathon');
 const d=JSON.parse(html(rows).match(/>(.*)<\/script>/)[1]);d.props.pageProps.content[0].pastEvents=[card({_key:'past',title:'HackMeridian 2026'})];d.props.pageProps.content[0].items=[card({body:'HackMeridian October 25-26, 2026'})];
 assert.equal(xlm.parse('<script id="__NEXT_DATA__">'+JSON.stringify(d)+'</script>',verifiedAt,now).length,1);
});
test('developer records in the upcoming schema survive; LOW is retained only as technical data',()=>{
 const dev={_type:'eventPage',_id:'dev',title:'Stellar Developer and Protocol Meeting',url:'/events/community/developer-and-protocol-meeting',startDate:'2026-10-15',endDate:null,startDateIso:'2026-10-15T00:00:00Z',startTime:'13:00 PST'};
 const s={_type:'cardHighlightSection',autoEvents:[dev],highlightedEvents:[],totalUpcomingEvents:1,pastEvents:[{...dev,_id:'past'}]};
 const p=xlm.inspect(html([card({title:'Founder dinner'})],{content:[{_type:'cardsSection',items:[card({title:'Founder dinner'})]},s]}),verifiedAt,now);
 assert.equal(p.events.length,1);assert.equal(p.events[0].startsAt,null);assert.equal(p.technicalEvents.length,2);assert.equal(p.rejected[0].reason,'low-priority-unreviewed');
 assert.throws(()=>xlm.inspect(html([],{content:[{...s,totalUpcomingEvents:2}]}),verifiedAt,now),/Incomplete/);
});
test('duplicates merge, but conflicting dates/end/status are refused',()=>{
 assert.equal(xlm.parse(html([card(),card(),card({_key:'alias',title:' Meridian 2026 '})]),verifiedAt,now).length,1);
 for(const patch of [{startDate:'2026-10-27'},{endDate:'2026-10-30'},{status:'cancelled'}])assert.throws(()=>xlm.parse(html([card(),card(patch)]),verifiedAt,now),/Conflicting/);
 assert.throws(()=>M.mergeEvents([fixture('XLM',1,{endDate:'2026-10-15'}),fixture('XLM',1,{endDate:'2026-10-16'})]),/Sprzeczne/);
});
test('cancellation, postponement, tentative and real 30-day boundaries never manufacture rows',()=>{
 for(const patch of [{isCancelled:true},{eventStatus:'https://schema.org/EventCancelled'},{status:'postponed'},{status:'tentative'}])assert.equal(xlm.parse(html([card(patch)]),verifiedAt,now).length,0);
 assert.equal(xlm.parse(html([card({startDate:'2026-11-10',endDate:'2026-11-11'})]),verifiedAt,now).length,1);
 assert.equal(xlm.parse(html([card({startDate:'2026-11-11',endDate:'2026-11-12'})]),verifiedAt,now).length,0);
 assert.equal(xlm.parse(html([card({startDate:'2026-10-11',endDate:'2026-10-12'})]),verifiedAt,now).length,0);
 for(const patch of [{startDate:'2026-02-30'},{endDate:'2026-10-27'},{status:'unknown'},{isCancelled:'false'}])assert.throws(()=>xlm.parse(html([card(patch)]),verifiedAt,now));
});
test('unknown schema, duplicate script, script injection, unsafe links and malformed end fields fail closed',()=>{
 for(const body of ['not JSON',html().replace('"content":','"oldContent":'),html()+html(),'<script id="__NEXT_DATA__">process.exit()</script>',html([card({ctas:[{href:'https://evil.test'}]})])])assert.throws(()=>xlm.parse(body,verifiedAt,now));
 for(const patch of [{endDate:'2026-02-30'},{endDate:'2026-10-13'},{endDateExclusive:'2026-10-14'},{endsAt:'invalid'}])assert.throws(()=>M.normalizeEvent(fixture('XLM',1,patch)));
 assert.throws(()=>xlm.parse(html([],{content:[{_type:'newEventGrid',items:[card()]}]}),verifiedAt,now),/Unsupported/);
 assert.throws(()=>xlm.parse(html([],{content:[]}),verifiedAt,now),/Missing Stellar event containers/);
});
test('global display is chronological, max five, max three per token when alternatives exist',()=>{
 const ethRows=Array.from({length:7},(_,i)=>fixture('ETH',i));const xlmRows=[fixture('XLM',10),fixture('XLM',11)];
 const selected=M.selectUpcoming([...xlmRows,...ethRows].reverse(),now);assert.deepEqual(selected.map(e=>e.token),['ETH','ETH','ETH','XLM','XLM']);assert.equal(selected.length,5);
 assert.equal(M.selectUpcoming(ethRows,now).length,5);assert.equal(M.selectUpcoming([...ethRows,xlmRows[0]],now).length,4);
 assert.equal(M.selectUpcoming([...ethRows,...xlmRows],now,Infinity).length,9);
 assert.equal(M.selectUpcoming([fixture('XLM',1,{priority:'low'})],now).length,0);
 const crossSource={...xlmRows[0],id:'alias',sourceId:'later-lumenloop',title:xlmRows[0].title.toUpperCase()};assert.equal(M.mergeEvents([...xlmRows,crossSource]).length,2);
});
test('new source revisions replace obsolete dates, removals and cancellations; outages preserve old verification',async t=>{
 const opts=await setup(t);let body=html();const fetchImpl=async()=>response(body);
 const one=await generate({...opts,adapters:[xlm],fetchImpl});assert.equal(one.events.length,1);
 body=html([card({startDate:'2026-10-30',endDate:'2026-10-31'})]);const moved=await generate({...opts,now:now+1000,force:true,adapters:[xlm],fetchImpl});assert.equal(moved.events[0].id,one.events[0].id);assert.equal(moved.events[0].date,'2026-10-30');
 const failed=await generate({...opts,now:now+2000,force:true,adapters:[xlm],fetchImpl:async()=>{throw Error('XLM outage');}});assert.equal(failed.sources[xlm.id].status,'stale');assert.equal(failed.events[0].verifiedAt,moved.events[0].verifiedAt);
 for(const rows of [[card({status:'cancelled'})],[]]){body=html(rows);const result=await generate({...opts,now:now+3000,force:true,adapters:[xlm],fetchImpl});assert.equal(result.sources[xlm.id].status,'fresh');assert.equal(result.events.length,0);}
});
test('XLM 403/429/invalid HTML does not break the independent ETH result, and cannot poison raw cache',async t=>{
 const opts=await setup(t),healthy={...eth,load:async()=>({events:[fixture('ETH',1)],verifiedAt,transport:'http-200'})};
 await generate({...opts,adapters:[xlm],fetchImpl:async()=>response(html())});const file=path.join(opts.cacheDir,xlm.id+'.json'),before=await fs.readFile(file,'utf8');
 for(const responseFactory of [()=>new Response('denied',{status:403}),()=>new Response('slow down',{status:429}),()=>response('broken')]){
  let requests=0;const r=await generate({...opts,adapters:[healthy,xlm],force:true,fetchImpl:async()=>{requests++;return responseFactory();}});assert.equal(requests,1);assert.ok(r.events.some(e=>e.token==='ETH'));assert.equal(r.sources[eth.id].status,'fresh');assert.equal(r.sources[xlm.id].status,'stale');assert.equal(await fs.readFile(file,'utf8'),before);
 }
});
test('local-only data cannot enter public output or scheduled requests even if project env says approved',async t=>{
 const opts=await setup(t),fetchImpl=async()=>assert.fail('No public request to local-only source');
 await assert.rejects(xlm.load({...opts,localTest:false,fetchImpl}),/explicit local test/);
 await assert.rejects(generate({...opts,outputPath:path.resolve(__dirname,'../data/crypto-calendar.json'),adapters:[xlm],fetchImpl}),/production data/);
 await assert.rejects(generate({...opts,outputPath:path.resolve(__dirname,'../DATA/crypto-calendar.json'),adapters:[xlm],fetchImpl}),/production data/);
 const env={GITHUB_REF:'refs/heads/main',CRYPTO_HYBRID_ENABLED:'true',CRYPTO_CALENDAR_APPROVED_SOURCES:eth.id+','+xlm.id};assert.throws(()=>authorize(env,[xlm]),/Local-only/);
 await assert.rejects(updateScheduled({...opts,adapters:[eth,xlm],approvedSourceIds:[eth.id,xlm.id],fetchImpl}),/Local-only/);
 assert.deepEqual(require('../scripts/crypto-calendar/sources.cjs').map(a=>a.id),['eth-pm','eth-glamsterdam','xlm-protocols']);
 const s=await generate({...opts,adapters:[xlm],fetchImpl:async()=>response(html())});assert.throws(()=>M.parseSnapshot({...s,mode:'automated-calendar',publication:{approved:true}},now),/lokalnego/);
});
test('HTML cache supports explicit ETag revalidation and never advances verification on offline reads',async t=>{
 const opts=await setup(t);await generate({...opts,adapters:[xlm],fetchImpl:async()=>response(html())});
 const checked=await generate({...opts,now:now+7*3600000,adapters:[xlm],fetchImpl:async(u,o)=>{assert.equal(o.headers.Accept,'text/html');assert.equal(o.headers['If-None-Match'],'"xlm-fixture"');return new Response(null,{status:304});}});
 assert.equal(checked.sources[xlm.id].transport,'http-304-revalidated');
 const offline=await generate({...opts,now:now+8*3600000,adapters:[xlm],offline:true,fetchImpl:async()=>assert.fail('offline request')});assert.equal(offline.events[0].verifiedAt,checked.events[0].verifiedAt);
});
