'use strict';
// These ICS entries are synthetic fixtures, never published as real events.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {testLive}=require('../scripts/test-crypto-calendar-live.cjs');
const adapter=require('../scripts/crypto-calendar/adapters/ethereum-protocol-calls.cjs');
const now=Date.parse('2026-10-11T12:00:00Z');
const ics='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\nBEGIN:VEVENT\r\nUID:live-fixture\r\nSUMMARY:AllCoreDevs Execution\r\nDTSTART:20261015T140000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
async function setup(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'crypto-live-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
test('technical test requires a new HTTP 200, creates only normalized evidence and never touches site data',async t=>{
 const artifactDir=await setup(t);let calls=0;
 const siteFile=path.join(__dirname,'../data/crypto-calendar.json'),before=await fs.readFile(siteFile,'utf8');
 const proof=await testLive({artifactDir,now,fetchImpl:async(u,o)=>{calls++;assert.equal(o.headers['If-None-Match'],undefined);return new Response(ics,{headers:{'content-type':'text/calendar'}});}});
 assert.equal(calls,1);assert.equal(proof.passed,true);assert.equal(proof.checks[0].httpStatus,200);assert.equal(proof.displayedEvents,1);assert.equal(proof.events[0].warsawTime,'16:00');assert.equal(proof.publicationApproved,false);
 assert.deepEqual((await fs.readdir(artifactDir)).sort(),['crypto-calendar.json','verification.json']);
 assert.equal(await fs.readFile(siteFile,'utf8'),before);
});
test('HTTP 304 without a fresh body and network failures cannot pass technical verification',async t=>{
 for(const fetchImpl of [async()=>new Response(null,{status:304}),async()=>{throw new TypeError('fetch failed');},async()=>new Response('broken',{headers:{'content-type':'text/calendar'}})]){
  const artifactDir=await setup(t);
  await assert.rejects(testLive({artifactDir,now,fetchImpl}),/Fresh HTTP 200/);
  const proof=JSON.parse(await fs.readFile(path.join(artifactDir,'verification.json'),'utf8'));
  assert.equal(proof.passed,false);assert.equal(proof.displayedEvents,0);
 }
});
test('a validated empty ICS is a successful empty calendar, never manufactured rows',async t=>{
 const artifactDir=await setup(t);
 const proof=await testLive({artifactDir,now,fetchImpl:async()=>new Response(ics.replace(/BEGIN:VEVENT[\s\S]*END:VEVENT\r\n/,''),{headers:{'content-type':'text/calendar'}})});
 assert.equal(proof.passed,true);assert.equal(proof.displayedEvents,0);
});
test('an adapter pretending to be fresh without an HTTP receipt is rejected',async t=>{
 const artifactDir=await setup(t);
 await assert.rejects(testLive({artifactDir,now,adapters:[{...adapter,load:async()=>({events:[],verifiedAt:new Date(now).toISOString(),transport:'http-200'})}]}),/Fresh HTTP 200/);
});

const {updateScheduled,authorize}=require('../scripts/update-crypto-calendar.cjs');
const M=require('../js/crypto-calendar-model.js');
test('production authorization rejects feature branches, missing enablement and unapproved new adapters',()=>{
 const env={GITHUB_REF:'refs/heads/main',CRYPTO_CALENDAR_ENABLED:'true',CRYPTO_CALENDAR_APPROVED_SOURCES:adapter.id};
 assert.deepEqual(authorize(env),[adapter.id]);
 for(const bad of [{...env,GITHUB_REF:'refs/heads/feature/crypto-calendar'},{...env,CRYPTO_CALENDAR_ENABLED:''},{...env,CRYPTO_CALENDAR_APPROVED_SOURCES:''}])assert.throws(()=>authorize(bad),/Production disabled/);
 assert.throws(()=>authorize(env,[adapter,{...adapter,id:'new-source'}]),/Production disabled/);
});
test('scheduled refresh publishes only fresh validated data and preserves prior bytes on outages',async t=>{
 const dir=await setup(t),outputPath=path.join(dir,'published.json'),options={outputPath,now,approvedSourceIds:[adapter.id]};
 const fresh=await updateScheduled({...options,fetchImpl:async()=>new Response(ics,{headers:{'content-type':'text/calendar'}})});
 assert.equal(fresh.mode,'automated-calendar');assert.equal(fresh.publication.approved,true);
 assert.equal(fresh.publication.licenseConfirmed,false);assert.equal(fresh.sources[adapter.id].reuse,'review-required');
 assert.equal(fresh.sources[adapter.id].fetch.httpStatus,200);
 M.parseSnapshot(fresh,now);assert.throws(()=>M.parseSnapshot({...fresh,publication:{approved:false}},now));
 const before=await fs.readFile(outputPath,'utf8');
 for(const failedAt of [now+1000,Date.parse('2026-10-16T12:00:00Z')]){
  await assert.rejects(updateScheduled({...options,now:failedAt,fetchImpl:async()=>{throw new Error('fixture network failure');}}),/public file preserved/);
  assert.equal(await fs.readFile(outputPath,'utf8'),before);
 }
 assert.equal(M.sourceIsStale(fresh.sources[adapter.id],now+M.MAX_AGE_MS+1),true);
 assert.equal(M.selectUpcoming(fresh.events,Date.parse('2026-10-16T12:00:00Z')).length,0);
 const recovered=await updateScheduled({...options,now:Date.parse('2026-10-16T13:00:00Z'),fetchImpl:async()=>new Response(ics.replace(/BEGIN:VEVENT[\s\S]*END:VEVENT\r\n/,''),{headers:{'content-type':'text/calendar'}})});
 assert.equal(recovered.sources[adapter.id].status,'fresh');assert.equal(recovered.events.length,0);
});
test('scheduled first-run errors, corrupt fallback and missing approval preserve original bytes',async t=>{
 const dir=await setup(t),outputPath=path.join(dir,'published.json'),options={outputPath,now,approvedSourceIds:[adapter.id]};
 const network=async()=>{throw new Error('outage');};
 await assert.rejects(updateScheduled({...options,fetchImpl:network}),/public file preserved/);
 await assert.rejects(fs.stat(outputPath),{code:'ENOENT'});
 await fs.writeFile(outputPath,'invalid prior bytes');
 await assert.rejects(updateScheduled({...options,fetchImpl:network}),/public file preserved/);
 assert.equal(await fs.readFile(outputPath,'utf8'),'invalid prior bytes');
 await assert.rejects(updateScheduled({...options,approvedSourceIds:[],fetchImpl:async()=>assert.fail('No unauthorized request')}),/explicit project publication authorization/);
 assert.equal(await fs.readFile(outputPath,'utf8'),'invalid prior bytes');
});
test('scheduled malformed ICS, changed URLs and forged freshness cannot overwrite last good data',async t=>{
 const dir=await setup(t),outputPath=path.join(dir,'published.json'),options={outputPath,now,approvedSourceIds:[adapter.id]};
 await updateScheduled({...options,fetchImpl:async()=>new Response(ics,{headers:{'content-type':'text/calendar'}})});
 const before=await fs.readFile(outputPath,'utf8');
 await assert.rejects(updateScheduled({...options,now:now+1000,fetchImpl:async()=>new Response('malformed',{headers:{'content-type':'text/calendar'}})}),/public file preserved/);
 assert.equal(await fs.readFile(outputPath,'utf8'),before);
 for(const replaced of [
  {...adapter,url:'https://example.org/new-source',load:async()=>{throw new Error('fixture outage');}},
  {...adapter,load:async()=>({events:[],verifiedAt:new Date(now+2000).toISOString(),transport:'http-200'})}
 ]){
  await assert.rejects(updateScheduled({...options,adapters:[replaced],now:now+2000}),/public file preserved/);
  assert.equal(await fs.readFile(outputPath,'utf8'),before);
 }
});
