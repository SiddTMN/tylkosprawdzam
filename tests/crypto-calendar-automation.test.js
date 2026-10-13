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
