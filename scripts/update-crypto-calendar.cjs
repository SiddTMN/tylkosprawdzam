'use strict';
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {generate}=require('./generate-crypto-calendar.cjs');
const {atomicJson,readCache}=require('./crypto-calendar/shared.cjs');
const model=require('../js/crypto-calendar-model.js');
const registry=require('./crypto-calendar/sources.cjs');
const OUTPUT=path.resolve(__dirname,'../data/crypto-calendar.json');

function authorize(env,adapters=registry){
  const ids=(env.CRYPTO_CALENDAR_APPROVED_SOURCES||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(env.GITHUB_REF!=='refs/heads/main'||env.CRYPTO_CALENDAR_ENABLED!=='true'||
    !adapters.length||adapters.some(a=>!ids.includes(a.id)))throw new Error('Production disabled: main, enablement and explicit approval of every source required');
  return ids;
}
async function validateFile(file=OUTPUT,now=Date.now()){
  return model.parseSnapshot(JSON.parse(await fs.readFile(file,'utf8')),now);
}
async function updateScheduled({outputPath=OUTPUT,now=Date.now(),adapters=registry,fetchImpl=fetch,approvedSourceIds=[]}={}){
  if(!adapters.length||adapters.some(a=>!approvedSourceIds.includes(a.id)))throw new Error('Every source requires explicit public reuse approval');
  const cacheDir=await fs.mkdtemp(path.join(os.tmpdir(),'crypto-calendar-scheduled-'));
  try{
    let previous=null;
    try{previous=await validateFile(outputPath,now);}catch{/* Invalid/expired snapshots are never trusted. */}
    // A clean runner can retain validated, still-future published facts without raw ICS cache.
    if(previous)for(const adapter of adapters){
      const s=previous.sources[adapter.id];
      if(s?.url===adapter.url&&s.verifiedAt!==null){
        await atomicJson(path.join(cacheDir,'local',adapter.id+'.last-good.json'),{
          id:adapter.id,url:adapter.url,verifiedAt:s.verifiedAt,
          events:model.selectUpcoming(previous.events.filter(e=>e.sourceId===adapter.id),now,Infinity)});
      }
    }
    const snapshot=await generate({now,adapters,fetchImpl,cacheDir,force:true,outputPath:path.join(cacheDir,'candidate.json')});
    const healthy=Object.values(snapshot.sources).some(s=>s.status==='fresh'&&s.transport==='http-200');
    if(!healthy&&!previous)throw new Error('No successful source or validated fallback; public file preserved');
    snapshot.mode='automated-calendar';
    snapshot.publication={approved:true,reason:'Explicit repository source approvals configured by the operator.',sourceIds:adapters.map(a=>a.id)};
    for(const s of Object.values(snapshot.sources))s.reuse='approved-by-repository-setting';
    model.parseSnapshot(snapshot,now);
    // Even an outage marker is validated; no new unverified events or verification times.
    await atomicJson(outputPath,snapshot);
    return snapshot;
  }finally{await fs.rm(cacheDir,{recursive:true,force:true});}
}
if(require.main===module)(async()=>{
  if(process.argv.length===3&&process.argv[2]==='--validate'){await validateFile();console.log('Crypto calendar JSON valid');return;}
  if(process.argv.length!==2)throw new Error('Unknown argument');
  const approvedSourceIds=authorize(process.env);
  const snapshot=await updateScheduled({approvedSourceIds});
  console.log(JSON.stringify({generatedAt:snapshot.generatedAt,events:snapshot.events.length,requests:snapshot.requests,sources:snapshot.sources},null,2));
  if(Object.values(snapshot.sources).some(s=>s.status!=='fresh'))console.log('::warning::Crypto source unavailable; only validated future fallback retained with original verification and stale status.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={authorize,updateScheduled,validateFile};
