'use strict';
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {atomicJson,getSource}=require('./crypto-calendar/shared.cjs');
const {licenseBlob}=require('./crypto-calendar/adapters/licensed-github.cjs');
const M=require('../js/crypto-calendar-model.js');
const registry=require('./crypto-calendar/sources.cjs');
const ROOT=path.resolve(__dirname,'..'),OUTPUT=path.join(ROOT,'data/crypto-auto.json'),MANUAL=path.join(ROOT,'data/crypto-manual.json');
const PREVIEW=path.join(ROOT,'docs/crypto-calendar-hybrid/preview/crypto-auto.json');
function reviewedAdapters(adapters){
  if(!adapters.length||new Set(adapters.map(a=>a.id)).size!==adapters.length)throw new Error('Empty/duplicate source registry');
  if(adapters.some(a=>a.localOnly||a.publication?.approved===false))throw new Error('Local-only source cannot enter public collection');
  for(const a of adapters){
    const reviewed=registry.find(r=>r.id===a.id);
    if(!reviewed||a.url!==reviewed.url||a.licenseApi!==reviewed.licenseApi||a.licenseBlobSha!==reviewed.licenseBlobSha||
      JSON.stringify(a.rights)!==JSON.stringify(reviewed.rights)||a.rights?.automatedAccess!==true||a.rights?.publicReuse!==true||
      new URL(a.url).origin!=='https://api.github.com'||typeof a.parse!=='function')throw new Error('Unreviewed source/license; publication.approved is not authorization');
  }
}
function authorize(env,adapters=registry){
  const ids=(env.CRYPTO_CALENDAR_APPROVED_SOURCES||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(env.GITHUB_REF!=='refs/heads/main'||env.CRYPTO_HYBRID_ENABLED!=='true')throw new Error('Production disabled: main and separate hybrid enablement required');
  reviewedAdapters(adapters);
  if(adapters.some(a=>!ids.includes(a.id)))throw new Error('Every source requires explicit project publication authorization');
  return ids;
}
async function validateFile(file=OUTPUT,now=Date.now(),manualPath=MANUAL){
  const auto=M.parseDataset(JSON.parse(await fs.readFile(file,'utf8')),'auto',now);
  if(manualPath){const manual=JSON.parse(await fs.readFile(manualPath,'utf8'));M.mergeDatasets(auto,manual,now);}
  return auto;
}
async function updateScheduled({outputPath=OUTPUT,now=Date.now(),adapters=registry,fetchImpl=fetch,approvedSourceIds=[],log=entry=>console.log(JSON.stringify(entry))}={}){
  reviewedAdapters(adapters);
  if(adapters.some(a=>!approvedSourceIds.includes(a.id)))throw new Error('Every source requires explicit project publication authorization');
  const target=path.resolve(outputPath).toLowerCase(),publicDir=path.join(ROOT,'data').toLowerCase();
  if((target===publicDir||target.startsWith(publicDir+path.sep))&&target!==OUTPUT.toLowerCase())throw new Error('Only crypto-auto.json may be updated; manual, macro and legacy files are protected');
  if(['crypto-manual.json','macro-calendar.json','crypto-calendar.json'].includes(path.basename(target)))throw new Error('Protected output file');
  const cacheDir=await fs.mkdtemp(path.join(os.tmpdir(),'crypto-hybrid-'));
  const generatedAt=new Date(now).toISOString(),sources={},events=[];
  const proof={generatedAt,publicationRun:false,requests:0,sources:[],counts:{}};
  try{
    for(const a of adapters){
      const state=sources[a.id]={name:a.name,url:a.url,checkedAt:generatedAt,verifiedAt:null,status:'unavailable',rights:{...a.rights},coverage:a.coverage};
      const evidence={id:a.id,accepted:0,rejected:[],license:null,fetch:null};proof.sources.push(evidence);
      try{
        const options={cacheDir,now,fetchImpl,force:true,onRequest:()=>proof.requests++};
        // Recheck the exact license blob on every run, BEFORE fetching records.
        const license=await getSource({id:a.id+'-license',kind:'github',url:a.licenseApi},options);
        const checked=licenseBlob(license.data,a.licenseBlobSha);
        evidence.license={blobSha:checked.sha,...license.receipt};
        const raw=await getSource({...a,validateData:undefined},options);
        if(raw.receipt?.httpStatus!==200||raw.verifiedAt!==generatedAt||!raw.receipt.bytes||!raw.receipt.sha256)throw new Error('Fresh HTTP 200 required');
        evidence.fetch=raw.receipt;
        // A changed list size/pagination is visible; we never claim exhaustive coverage.
        const parsed=a.parse(raw.data,generatedAt);
        if(!Array.isArray(parsed.events)||!Array.isArray(parsed.rejected))throw new Error('Invalid parser result');
        evidence.rejected.push(...parsed.rejected);
        const byId=new Map(),conflicts=new Set();
        for(const rawEvent of parsed.events){
          try{
            const e=M.hybridEvent({...rawEvent,license:a.rights.license,licenseUrl:a.rights.licenseUrl},'auto',now);
            if(e.sourceId!==a.id||e.verifiedAt!==generatedAt||e.assets.some(asset=>!a.assets.includes(asset)))throw new Error('Source identity disagreement');
            if(!M.upcomingHybrid([e],now,Infinity).length){evidence.rejected.push({id:e.id,reason:'outside-upcoming-window'});continue;}
            const prior=byId.get(e.id);
            if(prior&&JSON.stringify(prior)!==JSON.stringify(e)){conflicts.add(e.id);evidence.rejected.push({id:e.id,reason:'conflicting-duplicate-id'});}
            else byId.set(e.id,e);
          }catch(error){evidence.rejected.push({id:rawEvent?.id??null,reason:error.message});}
        }
        const accepted=[...byId.values()].filter(e=>!conflicts.has(e.id));
        evidence.accepted=accepted.length;events.push(...accepted);
        state.status='fresh';state.verifiedAt=generatedAt;state.fetch={...raw.receipt};state.licenseVerification={blobSha:checked.sha,checkedAt:generatedAt};
        state.hasMorePages=Boolean(raw.receipt.hasMorePages);state.rejected= evidence.rejected.length;
      }catch(error){state.error=error.message;evidence.error=error.message;}
      log({source:a.id,status:state.status,accepted:evidence.accepted,rejected:evidence.rejected,...(evidence.error?{error:evidence.error}:{})});
    }
    const candidate={schemaVersion:2,origin:'auto',generatedAt,displayTimezone:M.TIME_ZONE,complete:false,sources,events};
    M.parseDataset(candidate,'auto',now);
    candidate.events=M.mergeDatasets(candidate,{schemaVersion:2,origin:'manual',events:[]},now);
    for(const asset of Object.keys(M.ASSETS))proof.counts[asset]=candidate.events.filter(e=>e.assets.includes(asset)).length;
    proof.passed=Object.values(sources).every(s=>s.status==='fresh');
    // Receipts/logs stay outside the Pages data directory.
    const proofPath=target===OUTPUT.toLowerCase()?path.join(path.dirname(PREVIEW),'crypto-auto-verification.json'):path.join(path.dirname(outputPath),'crypto-auto-verification.json');
    await atomicJson(proofPath,proof);
    if(!Object.values(sources).some(s=>s.status==='fresh'))throw new Error('No fresh validated licensed source; public file preserved');
    await atomicJson(outputPath,candidate);
    return candidate;
  }finally{await fs.rm(cacheDir,{recursive:true,force:true});}
}
if(require.main===module)(async()=>{
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--validate'){await validateFile();console.log('Hybrid crypto datasets valid');return;}
  if(args.length===1&&args[0]==='--preview'){
    const result=await updateScheduled({outputPath:PREVIEW,approvedSourceIds:registry.map(a=>a.id)});
    console.log(JSON.stringify({preview:PREVIEW,events:result.events.length,complete:false}));
    if(Object.values(result.sources).some(s=>s.status!=='fresh'))process.exitCode=2;
    return;
  }
  if(args.length)throw new Error('Use --validate or --preview');
  const approvedSourceIds=authorize(process.env);
  // Invalid human edits cannot enter the automated publication transaction.
  M.parseDataset(JSON.parse(await fs.readFile(MANUAL,'utf8')),'manual');
  await updateScheduled({approvedSourceIds});
  await validateFile();
})().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={authorize,reviewedAdapters,updateScheduled,validateFile,PREVIEW};
