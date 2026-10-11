'use strict';
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {generate}=require('./generate-crypto-calendar.cjs');
const {readCache,atomicJson}=require('./crypto-calendar/shared.cjs');
const model=require('../js/crypto-calendar-model.js');
const registry=require('./crypto-calendar/sources.cjs');

// A unique empty directory prevents a restored cache or HTTP 304 from passing.
async function testLive({artifactDir,now=Date.now(),adapters=registry,fetchImpl=fetch}={}){
  if(!artifactDir)throw new Error('Artifact directory required');
  const cacheDir=await fs.mkdtemp(path.join(os.tmpdir(),'crypto-calendar-live-'));
  try{
    await fs.mkdir(artifactDir,{recursive:true});
    const snapshot=await generate({now,adapters,fetchImpl,force:true,cacheDir,outputPath:path.join(artifactDir,'crypto-calendar.json')});
    model.parseSnapshot(snapshot,now);
    const checks=[];
    for(const adapter of adapters){
      const raw=await readCache(path.join(cacheDir,adapter.id+'.json'));
      const normalized=await readCache(path.join(cacheDir,'local',adapter.id+'.last-good.json'));
      const state=snapshot.sources[adapter.id],receipt=raw?.receipt;
      const passed=state.status==='fresh'&&state.transport==='http-200'&&
        receipt?.httpStatus===200&&receipt.url===adapter.url&&receipt.checkedAt===snapshot.generatedAt&&
        raw.verifiedAt===snapshot.generatedAt&&receipt.bytes>0&&/^[a-f0-9]{64}$/.test(receipt.sha256);
      checks.push({id:adapter.id,url:adapter.url,passed,status:state.status,transport:state.transport||null,
        httpStatus:receipt?.httpStatus??null,bytes:receipt?.bytes??null,sha256:receipt?.sha256??null,
        checkedAt:receipt?.checkedAt??null,eligibleEvents:normalized?.events.length??0,error:state.error||null});
    }
    const proof={passed:checks.every(c=>c.passed)&&snapshot.requests===adapters.length,
      commit:process.env.GITHUB_SHA||null,generatedAt:snapshot.generatedAt,timezone:model.TIME_ZONE,
      window:snapshot.window,requests:snapshot.requests,checks,displayedEvents:snapshot.events.length,
      events:snapshot.events.map(e=>({token:e.token,title:e.title,date:e.date,startsAt:e.startsAt,
        warsawTime:e.startsAt?new Intl.DateTimeFormat('pl-PL',{timeZone:model.TIME_ZONE,hour:'2-digit',minute:'2-digit'}).format(new Date(e.startsAt)):null,
        sourceUrl:e.sourceUrl,verifiedAt:e.verifiedAt})),publicationApproved:false};
    await atomicJson(path.join(artifactDir,'verification.json'),proof);
    if(!proof.passed)throw new Error('Fresh HTTP 200 verification failed; see verification.json');
    return proof;
  }finally{await fs.rm(cacheDir,{recursive:true,force:true});}
}
if(require.main===module)testLive({artifactDir:process.argv[2]}).then(proof=>console.log(JSON.stringify(proof,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={testLive};
