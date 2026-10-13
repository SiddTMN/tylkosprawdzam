'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {M,registry,source,now,issue,license,mockFetch,event}=require('./helpers/crypto-hybrid.cjs');
const {parsePm,licenseBlob}=require('../scripts/crypto-calendar/adapters/licensed-github.cjs');
const {updateScheduled,authorize,validateFile}=require('../scripts/update-crypto-calendar.cjs');
async function setup(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'crypto-hybrid-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return {dir,outputPath:path.join(dir,'crypto-auto.json'),now,adapters:[source],approvedSourceIds:[source.id],log:()=>{}};}
test('production requires main, separate enablement, all source approvals and licensed channels',()=>{
 const env={GITHUB_REF:'refs/heads/main',CRYPTO_HYBRID_ENABLED:'true',CRYPTO_CALENDAR_APPROVED_SOURCES:registry.map(a=>a.id).join(',')};
 assert.equal(authorize(env).length,3);
 for(const bad of [{...env,GITHUB_REF:'refs/heads/pilot/xlm-20261012'},{...env,CRYPTO_HYBRID_ENABLED:''},{...env,CRYPTO_CALENDAR_APPROVED_SOURCES:''},{...env,CRYPTO_HYBRID_ENABLED:'false',CRYPTO_CALENDAR_ENABLED:'true'}])assert.throws(()=>authorize(bad));
 assert.throws(()=>authorize(env,[{...source,url:'https://calendar.google.com/feed',publication:{approved:true}}]),/Unreviewed/);
 assert.throws(()=>authorize(env,[{...source,rights:{...source.rights,publicReuse:false}}]),/Unreviewed/);
});
test('scheduled refresh writes verified facts only, never changes manual/macro/legacy bytes',async t=>{
 const opts=await setup(t),calls=[];
 const protectedFiles=['crypto-manual.json','macro-calendar.json','crypto-calendar.json'];for(const f of protectedFiles)await fs.writeFile(path.join(opts.dir,f),'protected fixture bytes');
 const result=await updateScheduled({...opts,fetchImpl:mockFetch({calls})});
 assert.equal(result.origin,'auto');assert.equal(result.events.length,1);assert.equal(result.sources[source.id].status,'fresh');assert.equal(result.sources[source.id].fetch.httpStatus,200);assert.equal(result.sources[source.id].licenseVerification.blobSha,source.licenseBlobSha);
 assert.equal(calls.length,2);assert.ok(calls.every(c=>c.url.startsWith('https://api.github.com/')&&!c.options.headers.Authorization));
 M.parseDataset(result,'auto',now);await validateFile(opts.outputPath,now,null);
 for(const f of protectedFiles){assert.equal(await fs.readFile(path.join(opts.dir,f),'utf8'),'protected fixture bytes');await assert.rejects(updateScheduled({...opts,outputPath:path.join(opts.dir,f),fetchImpl:async()=>assert.fail('No request')}),/Protected/);}
 const proof=JSON.parse(await fs.readFile(path.join(opts.dir,'crypto-auto-verification.json'),'utf8'));assert.equal(proof.requests,2);assert.equal(proof.passed,true);
});
test('total outages, malformed data and HTTP 304 cannot overwrite last verified file',async t=>{
 const opts=await setup(t);await updateScheduled({...opts,fetchImpl:mockFetch()});const before=await fs.readFile(opts.outputPath,'utf8');
 for(const fetchImpl of [mockFetch({fail:true}),mockFetch({data:{not:'issues'}}),async()=>new Response(null,{status:304})]){
  await assert.rejects(updateScheduled({...opts,now:now+1000,fetchImpl}),/public file preserved/);assert.equal(await fs.readFile(opts.outputPath,'utf8'),before);
 }
 assert.equal(M.autoSourceIsStale(JSON.parse(before).sources[source.id],now+M.AUTO_MAX_AGE_MS+1),true);
 const empty=await updateScheduled({...opts,now:now+2000,fetchImpl:mockFetch({data:[]})});assert.equal(empty.events.length,0);assert.equal(empty.sources[source.id].status,'fresh');
});
test('first-run errors, corrupt prior bytes and absent approvals fail without replacing output',async t=>{
 const opts=await setup(t);await assert.rejects(updateScheduled({...opts,fetchImpl:mockFetch({fail:true})}),/public file preserved/);await assert.rejects(fs.stat(opts.outputPath),{code:'ENOENT'});
 await fs.writeFile(opts.outputPath,'corrupt prior bytes');await assert.rejects(updateScheduled({...opts,fetchImpl:mockFetch({fail:true})}));assert.equal(await fs.readFile(opts.outputPath,'utf8'),'corrupt prior bytes');
 await assert.rejects(updateScheduled({...opts,approvedSourceIds:[],fetchImpl:async()=>assert.fail('Unauthorized request')}),/explicit project/);
});
test('changed license contents/SHAs stop record requests and leave approved=true ineffective',async t=>{
 const opts=await setup(t),calls=[],tampered={...license(),content:Buffer.from('no permission').toString('base64')};
 await assert.rejects(updateScheduled({...opts,fetchImpl:mockFetch({calls,licenseData:tampered})}),/public file preserved/);assert.equal(calls.length,1);
 assert.throws(()=>licenseBlob({...license(),sha:'f'.repeat(40)},source.licenseBlobSha),/License changed/);
 await assert.rejects(updateScheduled({...opts,adapters:[{...source,id:'not-reviewed',publication:{approved:true}}]}),/Unreviewed/);
});
test('invalid or conflicting records are omitted and reasons logged; never fill empty sources',async t=>{
 const opts=await setup(t),logs=[];
 const bad=issue({body:'### UTC Date & Time\n\nTBD\n\n### Call Series\n\nAll Core Devs - Execution'});
 const result=await updateScheduled({...opts,fetchImpl:mockFetch({data:[bad]}),log:x=>logs.push(x)});assert.equal(result.events.length,0);assert.match(logs[0].rejected[0].reason,/UTC-date/);
 const forged={...source,parse:()=>({events:[{id:'invalid',origin:'auto'}],rejected:[]})};const empty=await updateScheduled({...opts,adapters:[forged],fetchImpl:mockFetch()});assert.equal(empty.events.length,0);
 const conflicting={...source,parse:()=>({events:[event(),event({period:{precision:'day',date:'2026-10-16'}})],rejected:[]})};
 const conflict=await updateScheduled({...opts,adapters:[conflicting],fetchImpl:mockFetch(),log:x=>logs.push(x)});assert.equal(conflict.events.length,0);assert.ok(logs.at(-1).rejected.some(r=>r.reason==='conflicting-duplicate-id'));
});
test('one licensed source outage leaves healthy source and validated empty states usable',async t=>{
 const opts=await setup(t),xlm=registry[2];
 const result=await updateScheduled({...opts,adapters:[source,xlm],approvedSourceIds:[source.id,xlm.id],fetchImpl:async(url,o)=>{if(url===xlm.licenseApi)throw new Error('XLM fixture outage');return mockFetch()(url,o);}});
 assert.equal(result.events.length,1);assert.equal(result.sources[xlm.id].status,'unavailable');assert.equal(result.sources[xlm.id].verifiedAt,null);assert.equal(result.events.some(e=>e.assets.includes('XLM')),false);
});
test('parser supports UTC links and exact dates, rejects ambiguity, mismatches, cancellation, PRs',()=>{
 const original=issue(),linked=issue({body:original.body.replace('October 15, 2026, 14:00 UTC','[October 15, 2026, 14:00 UTC](https://example.org/utc)')});
 const parsed=parsePm([linked],new Date(now).toISOString());assert.equal(parsed.events[0].startsAt,'2026-10-15T14:00:00Z');assert.doesNotMatch(JSON.stringify(parsed.events),/Fixture only agenda/);
 for(const bad of [issue({body:original.body.replace('14:00','25:00')}),issue({body:original.body.replace('15, 2026','16, 2026')}),issue({body:original.body+'\nCancelled'}),issue({pull_request:{}}),issue({body:original.body+'\n### UTC Date & Time\n\nOctober 15, 2026, 14:00 UTC'}),issue({title:'Future release — October 15, 2026'})]){const p=parsePm([bad],new Date(now).toISOString());assert.equal(p.events.length,0);assert.equal(p.rejected.length,1);}
});
test('automatic stable IDs track rescheduling, closure/removal no longer publishes old date',async t=>{
 const opts=await setup(t),first=await updateScheduled({...opts,fetchImpl:mockFetch()});
 const movedIssue=issue({title:issue().title.replace('15,','16,'),body:issue().body.replace('15,','16,')});
 const moved=await updateScheduled({...opts,now:now+1000,fetchImpl:mockFetch({data:[movedIssue]})});assert.equal(moved.events[0].id,first.events[0].id);assert.equal(moved.events[0].period.date,'2026-10-16');
 const removed=await updateScheduled({...opts,now:now+2000,fetchImpl:mockFetch({data:[issue({state:'closed'})]})});assert.equal(removed.events.length,0);
});
