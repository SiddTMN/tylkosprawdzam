'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {generate}=require('./generate-crypto-calendar.cjs');
const {readCache,atomicJson}=require('./crypto-calendar/shared.cjs');
const model=require('../js/crypto-calendar-model.js');
const adapters=require('./crypto-calendar/local-sources.cjs');
const ROOT=path.resolve(__dirname,'..'),DIR=path.join(ROOT,'docs/crypto-calendar-xlm/stage2');
async function testLive({now=Date.now(),fetchImpl=fetch}={}){
 const files=['data/crypto-calendar.json','data/macro-calendar.json','scripts/crypto-calendar/adapters/ethereum-protocol-calls.cjs','scripts/crypto-calendar/sources.cjs',
  ...(await fs.readdir(path.join(ROOT,'.github/workflows'))).map(f=>'.github/workflows/'+f)];
 const hashes=async()=>Promise.all(files.map(async file=>[file,crypto.createHash('sha256').update(await fs.readFile(path.join(ROOT,file))).digest('hex')]));
 const before=await hashes(),cacheDir=path.join(DIR,'.cache');
 const snapshot=await generate({now,adapters,localTest:true,fetchImpl,force:true,cacheDir,outputPath:path.join(DIR,'crypto-calendar.json')});
 model.parseSnapshot(snapshot,now);
 const all=[],checks=[];
 for(const adapter of adapters){
  const raw=await readCache(path.join(cacheDir,adapter.id+'.json')),normalized=await readCache(path.join(cacheDir,'local',adapter.id+'.last-good.json'));
  const state=snapshot.sources[adapter.id],receipt=raw?.receipt;
  const passed=state.status==='fresh'&&state.transport==='http-200'&&receipt?.httpStatus===200&&receipt.url===adapter.url&&receipt.checkedAt===snapshot.generatedAt&&raw.verifiedAt===snapshot.generatedAt&&receipt.bytes>0&&/^[a-f0-9]{64}$/.test(receipt.sha256);
  checks.push({id:adapter.id,token:adapter.token,url:adapter.url,passed,receipt:receipt||null,eligibleEvents:normalized?.events.length||0,error:state.error||null});
  if(normalized)all.push(...normalized.events);
 }
 const unique=model.mergeEvents(all),selected=model.selectUpcoming(unique,now);
 const after=await hashes();
 const proof={passed:checks.every(c=>c.passed)&&snapshot.requests===adapters.length&&JSON.stringify(before)===JSON.stringify(after)&&JSON.stringify(selected)===JSON.stringify(snapshot.events),
  generatedAt:snapshot.generatedAt,window:snapshot.window,requests:snapshot.requests,checks,eligibleCounts:Object.fromEntries(['ETH','XLM'].map(token=>[token,unique.filter(e=>e.token===token).length])),
  displayedCounts:Object.fromEntries(['ETH','XLM'].map(token=>[token,snapshot.events.filter(e=>e.token===token).length])),displayedEvents:snapshot.events,
  duplicates:all.length-unique.length,protectedFilesUnchanged:JSON.stringify(before)===JSON.stringify(after),protectedHashes:after,publication:snapshot.publication,
  note:'HackMeridian appears only if a typed, dated record is present in the official Hub; no FAQ dates or Lumen Loop events are injected.'};
 await atomicJson(path.join(DIR,'events.eligible.json'),{generatedAt:snapshot.generatedAt,window:snapshot.window,events:unique});
 await atomicJson(path.join(DIR,'events.public-approved.json'),{generatedAt:snapshot.generatedAt,events:[],reason:'XLM local test only; this experiment does not publish or alter the existing ETH snapshot.'});
 await atomicJson(path.join(DIR,'verification.json'),proof);
 console.log(JSON.stringify({passed:proof.passed,generatedAt:proof.generatedAt,eligibleCounts:proof.eligibleCounts,displayedCounts:proof.displayedCounts,duplicates:proof.duplicates,events:proof.displayedEvents.map(e=>({token:e.token,title:e.title,date:e.date,endDate:e.endDate||null,startsAt:e.startsAt})),checks},null,2));
 if(!proof.passed)throw Error('Live ETH/XLM verification failed; see stage2/verification.json');return proof;
}
if(require.main===module)testLive().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={testLive};
