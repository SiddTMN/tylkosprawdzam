'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {policy,emptyState,validateState,observe,summary,nextAllowed,runPilot,HOURS_6,PILOT_END_AT,PILOT_END_MS}=require('../scripts/crypto-calendar/xlm-pilot.cjs');
const {combine}=require('../scripts/summarize-xlm-pilot.cjs');
const at='2026-10-12T12:00:00.000Z',now=Date.parse(at);
const event=(id='one',date='2026-10-28')=>({id,sourceId:'xlm-stellar-events',priority:'high',category:'conference',date,startsAt:null,endDate:'2026-10-29',endsAt:null,publisherStatus:null});
const html=(extra='')=>'<script id="__NEXT_DATA__">'+JSON.stringify({props:{pageProps:{url:'https://stellar.org/events',content:[{_type:'cardsSection',items:[{_type:'eventCard',_key:'fixture',title:'Meridian 2026',startDate:'2026-10-28',endDate:'2026-10-29',ctas:[{href:'https://meridian.stellar.org'}]}]}]}}})+'</script>'+extra;
const ics='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:eth-fixture\r\nSUMMARY:AllCoreDevs Consensus\r\nDTSTART:20261015T140000Z\r\nDTEND:20261015T150000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
async function opts(t){const base=await fs.mkdtemp(path.join(os.tmpdir(),'xlm-pilot-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));return {now,mode:'probe',artifactDir:path.join(base,'artifacts'),stateDir:path.join(base,'state'),scratchDir:path.join(base,'private'),env:{}};}
const fetchOk=async url=>new Response(url.includes('stellar.org')?html():ics,{headers:{'content-type':url.includes('stellar.org')?'text/html':'text/calendar'}});
test('samples continue beyond fourteen days and through 12 November Warsaw; probe is explicit',()=>{
 assert.equal(policy({mode:'sample',enabled:false,now}).allowed,false);assert.throws(()=>policy({mode:'sample',enabled:true,startAt:'bad',now}));
 assert.equal(policy({mode:'sample',enabled:true,startAt:at,now:now-1}).allowed,false);
 assert.equal(policy({mode:'sample',enabled:true,startAt:at,now:now+14*86400000}).allowed,true);
 assert.equal(policy({mode:'sample',enabled:true,startAt:at,now:PILOT_END_MS-1}).allowed,true);
 assert.equal(modelDay(PILOT_END_MS-1),'2026-11-12');assert.equal(modelDay(PILOT_END_MS),'2026-11-13');
 const end=policy({mode:'sample',enabled:true,startAt:at,now:PILOT_END_MS});assert.equal(end.allowed,false);assert.equal(end.reason,'expired');assert.equal(end.endAt,PILOT_END_AT);
 assert.equal(policy({mode:'probe',now}).scope,'one-time-cold-probe');
});
const modelDay=require('../js/crypto-calendar-model.js').day;
test('a later start never extends the fixed deadline and cannot start after it',()=>{
 const later='2026-11-05T10:00:00.000Z';assert.equal(policy({mode:'sample',enabled:true,startAt:later,now:PILOT_END_MS-1}).endAt,PILOT_END_AT);
 assert.throws(()=>policy({mode:'sample',enabled:true,startAt:PILOT_END_AT,now}),/precede/);
 assert.throws(()=>policy({mode:'sample',enabled:true,startAt:'2026-11-13T00:00:00.000Z',now}),/precede/);
 assert.equal(summary(emptyState(at)).endAt,PILOT_END_AT);
});
test('baseline, repeated observations, new identities and revisions have different meanings',()=>{
 const s=emptyState(at),one={checkedAt:at},two={checkedAt:new Date(now+HOURS_6).toISOString()};observe(s,[event()],one);assert.equal(one.newIdentitiesAfterBaseline,0);
 observe(s,[event('one','2026-10-27'),event('two')],two);assert.equal(two.newIdentitiesAfterBaseline,1);assert.equal(two.dateOrStatusRevisions,1);
 assert.equal(summary(s).baselineIdentities,1);assert.equal(summary(s).newIdentitiesAfterBaseline,1);assert.equal(summary(s).dateOrStatusRevisions,1);assert.doesNotMatch(JSON.stringify(s),/Meridian|2026-10-28|stellar\.org/);
});
test('history schema rejects copied content and unexpected fields',()=>{
 const s=emptyState(at);assert.throws(()=>validateState({...s,title:'Publisher title'},at),/unredacted/);
 const sample={checkedAt:at};observe(s,[event()],sample);const key=Object.keys(s.entities)[0];s.entities[key].description='Not allowed';assert.throws(()=>validateState(s,at),/unredacted/);
});
test('Retry-After and rate-reset extend the six-hour minimum',()=>{
 assert.equal(nextAllowed(now,{}),new Date(now+HOURS_6).toISOString());assert.equal(nextAllowed(now,{retryAfter:'86400'}),new Date(now+86400000).toISOString());assert.equal(nextAllowed(now,{status:403,rateReset:String((now+2*86400000)/1000)}),new Date(now+2*86400000).toISOString());
});
test('cold hosted probe requires real HTTP 200 and emits only redacted artifacts',async t=>{
 const o=await opts(t),r=await runPilot({...o,env:{GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_RUN_ID:'fixture-run'},fetchImpl:fetchOk});
 assert.equal(r.coldHttp200Passed,true);assert.equal(r.requests,2);assert.equal(r.sample.eligibleXlm,1);assert.equal(r.sample.eligibleEth,1);assert.equal(r.publicRecords,0);assert.equal(r.publicationApproved,false);assert.equal(r.protectedFilesUnchanged,true);
 for(const f of await fs.readdir(o.artifactDir)){const text=await fs.readFile(path.join(o.artifactDir,f),'utf8');assert.doesNotMatch(text,/Meridian|AllCoreDevs|2026-10-28|sourceUrl|sourceStartDate|BEGIN:VCALENDAR|__NEXT_DATA__/);}
 await assert.rejects(runPilot({...o,env:{GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'self-hosted'},fetchImpl:async()=>assert.fail('No self-hosted request')}),/GitHub-hosted/);
});
test('old source cache cannot satisfy a cold probe; HTTP 304 never passes',async t=>{
 const o=await opts(t);await runPilot({...o,fetchImpl:fetchOk});let n=0;
 const r=await runPilot({...o,now:now+1000,fetchImpl:async url=>{n++;return url.includes('stellar.org')?new Response(null,{status:304}):fetchOk(url);}});
 assert.equal(n,2);assert.equal(r.coldHttp200Passed,false);assert.equal(r.status,'failure');assert.equal(r.sample.ethStatus,'fresh');
});
test('scheduled source backoff does not make another Stellar request or stop ETH',async t=>{
 const o={...await opts(t),mode:'sample',enabled:true,startAt:at};await runPilot({...o,fetchImpl:fetchOk});let xlmCalls=0,ethCalls=0;
 const r=await runPilot({...o,now:now+1000,fetchImpl:async url=>{if(url.includes('stellar.org'))xlmCalls++;else ethCalls++;return fetchOk(url);}});
 assert.equal(xlmCalls,0);assert.equal(ethCalls,1);assert.equal(r.status,'backoff-skip');assert.equal(r.sample.verifiedAt,at);assert.equal(r.sample.ethStatus,'fresh');
});
test('XLM 429 retains its last real verification and records outage independently of ETH',async t=>{
 const o={...await opts(t),mode:'sample',enabled:true,startAt:at};await runPilot({...o,fetchImpl:fetchOk});
 const r=await runPilot({...o,now:now+HOURS_6,fetchImpl:async url=>url.includes('stellar.org')?new Response('denied',{status:429,headers:{'retry-after':'86400'}}):fetchOk(url)});
 assert.equal(r.status,'failure');assert.equal(r.sample.verifiedAt,at);assert.equal(r.sample.ethStatus,'fresh');
 const state=JSON.parse(await fs.readFile(path.join(o.stateDir,'history.json'),'utf8'));assert.equal(state.notBeforeAt,new Date(now+HOURS_6+86400000).toISOString());assert.equal(summary(state).failedFetches,1);
});
test('disabled or expired pilot makes no external requests',async t=>{
 const o=await opts(t);for(const p of [{enabled:false,startAt:at,now},{enabled:true,startAt:at,now:PILOT_END_MS}]){const r=await runPilot({...o,...p,mode:'sample',fetchImpl:async()=>assert.fail('Stopped pilot request')});assert.equal(r.requests,0);assert.equal(r.status,'not-running');}
});
test('an enabled sample still fetches after day fourteen and reports the fixed deadline',async t=>{
 const o={...await opts(t),mode:'sample',enabled:true,startAt:at,now:now+15*86400000};
 const r=await runPilot({...o,fetchImpl:fetchOk});
 assert.equal(r.status,'success');assert.equal(r.requests,2);assert.equal(r.sample.eligibleXlm,1);
 const report=JSON.parse(await fs.readFile(path.join(o.artifactDir,'summary.json'),'utf8'));
 assert.equal(report.endAt,PILOT_END_AT);assert.equal(report.publicationApproved,false);
});
test('multiple artifact histories reconcile cumulative samples without double counting',async t=>{
 const o={...await opts(t),mode:'sample',enabled:true,startAt:at};await runPilot({...o,fetchImpl:fetchOk});const first=JSON.parse(await fs.readFile(path.join(o.stateDir,'history.json'),'utf8'));await runPilot({...o,now:now+HOURS_6,fetchImpl:fetchOk});const second=JSON.parse(await fs.readFile(path.join(o.stateDir,'history.json'),'utf8'));const merged=combine([first,second]);assert.equal(merged.samples,2);assert.equal(merged.uniqueValuableIdentities,1);assert.equal(merged.newIdentitiesAfterBaseline,0);assert.equal(merged.repeatedObservations,1);
});
