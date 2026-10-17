'use strict';
// Artifact-only pilot: full records live solely in disposable/private scratch, never in public artifacts.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {generate}=require('../generate-crypto-calendar.cjs');
const {atomicJson,readCache}=require('./shared.cjs');
const model=require('../../js/crypto-calendar-model.js');
const adapters=require('./local-sources.cjs'),xlm=adapters.find(a=>a.token==='XLM');
const HOURS_6=6*3600000;
// Inclusive 12 November in Europe/Warsaw (CET): stop at local midnight on the 13th.
const PILOT_END_AT='2026-11-12T23:00:00.000Z',PILOT_END_MS=Date.parse(PILOT_END_AT);
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function policy({mode='sample',enabled=false,startAt,now=Date.now()}={}){
 if(!['probe','sample'].includes(mode))throw Error('Invalid pilot mode');
 if(mode==='probe')return {allowed:true,mode,scope:'one-time-cold-probe'};
 if(!enabled)return {allowed:false,mode,reason:'disabled'};
 const start=model.timestamp(startAt);if(start===null)throw Error('Pilot start must be an explicit UTC timestamp');
 if(start>=PILOT_END_MS)throw Error('Pilot start must precede the 12 November Warsaw deadline');
 return {allowed:now>=start&&now<PILOT_END_MS,mode,startAt,endAt:PILOT_END_AT,reason:now<start?'not-started':now>=PILOT_END_MS?'expired':null};
}
function emptyState(startAt){return {schemaVersion:1,startAt,baselineAt:null,entities:{},samples:[],lastAttemptAt:null,lastVerifiedAt:null,notBeforeAt:null};}
function onlyKeys(value,keys){if(Object.keys(value).some(k=>!keys.includes(k)))throw Error('Unexpected unredacted pilot field');}
function validateState(state,startAt){
 if(state?.schemaVersion!==1||state.startAt!==startAt||!state.entities||Array.isArray(state.entities)||typeof state.entities!=='object'||Object.keys(state.entities).length>2000||!Array.isArray(state.samples)||state.samples.length>500)throw Error('Invalid or mismatched pilot history');
 onlyKeys(state,['schemaVersion','startAt','baselineAt','entities','samples','lastAttemptAt','lastVerifiedAt','notBeforeAt']);
 for(const key of ['baselineAt','lastAttemptAt','lastVerifiedAt','notBeforeAt'])if(state[key]!==null&&model.timestamp(state[key])===null)throw Error('Invalid pilot history timestamp');
 for(const [key,e] of Object.entries(state.entities)){
  if(!/^[a-f0-9]{64}$/.test(key)||!/^[a-f0-9]{64}$/.test(e.fingerprint)||!['high','medium'].includes(e.priority)||typeof e.routine!=='boolean'||typeof e.baseline!=='boolean'||model.timestamp(e.firstSeenAt)===null||model.timestamp(e.lastSeenAt)===null||!Number.isInteger(e.revisions)||e.revisions<0)throw Error('Invalid redacted event history');
  onlyKeys(e,['fingerprint','priority','routine','baseline','firstSeenAt','lastSeenAt','revisions']);
 }
 for(const s of state.samples){
  onlyKeys(s,['checkedAt','xlmOutcome','httpStatus','errorKind','verifiedAt','eligibleXlm','displayedXlm','eligibleEth','ethStatus','duplicateRecords','unresolvedClocks','technicalRecords','newIdentitiesAfterBaseline','dateOrStatusRevisions','baseline']);
  if(model.timestamp(s.checkedAt)===null||s.verifiedAt!==null&&model.timestamp(s.verifiedAt)===null||!['success','failure','backoff-skip'].includes(s.xlmOutcome)||!['fresh','cached','stale','unavailable'].includes(s.ethStatus)||![null,'network','http','invalid-data','rate-limit-or-access'].includes(s.errorKind)||s.httpStatus!==null&&(!Number.isInteger(s.httpStatus)||s.httpStatus<100||s.httpStatus>599)||s.baseline!==undefined&&typeof s.baseline!=='boolean')throw Error('Invalid pilot sample');
  for(const key of ['eligibleXlm','displayedXlm','eligibleEth','duplicateRecords','unresolvedClocks','technicalRecords','newIdentitiesAfterBaseline','dateOrStatusRevisions'])if(s[key]!==null&&(!Number.isInteger(s[key])||s[key]<0))throw Error('Invalid pilot sample counter');
 }
 return state;
}
function observe(state,events,sample){
 const baseline=state.baselineAt===null;let newlySeen=0,revisions=0;
 for(const e of events){
  const key=hash([e.sourceId,e.id]),fingerprint=hash([e.date,e.startsAt,e.endDate??null,e.endsAt??null,e.publisherStatus??null]);
  const prior=state.entities[key];
  if(prior){if(prior.fingerprint!==fingerprint){prior.revisions++;revisions++;prior.fingerprint=fingerprint;}prior.lastSeenAt=sample.checkedAt;}
  else {state.entities[key]={fingerprint,priority:e.priority,routine:e.category==='protocol-meeting',baseline,firstSeenAt:sample.checkedAt,lastSeenAt:sample.checkedAt,revisions:0};newlySeen++;}
 }
 if(baseline)state.baselineAt=sample.checkedAt;
 sample.baseline=baseline;sample.newIdentitiesAfterBaseline=baseline?0:newlySeen;sample.dateOrStatusRevisions=revisions;
 return state;
}
function summary(state){
 const samples=state.samples,entities=Object.values(state.entities),attempts=samples.filter(s=>s.xlmOutcome==='success'||s.xlmOutcome==='failure'),successes=attempts.filter(s=>s.xlmOutcome==='success'),routine=entities.filter(e=>e.routine).length;
 return {schemaVersion:1,startAt:state.startAt,endAt:PILOT_END_AT,baselineAt:state.baselineAt,
  samples:samples.length,fetchAttempts:attempts.length,successfulFetches:successes.length,failedFetches:attempts.length-successes.length,availability:attempts.length?successes.length/attempts.length:null,
  uniqueValuableIdentities:entities.length,baselineIdentities:entities.filter(e=>e.baseline).length,newIdentitiesAfterBaseline:entities.filter(e=>!e.baseline).length,
  repeatedObservations:successes.reduce((sum,s)=>sum+s.eligibleXlm,0)-entities.length,
  duplicateRecords:successes.reduce((sum,s)=>sum+s.duplicateRecords,0),dateOrStatusRevisions:entities.reduce((sum,e)=>sum+e.revisions,0),
  invalidOrConflictingResponses:attempts.filter(s=>s.errorKind==='invalid-data').length,
  routineIdentities:routine,routineShare:entities.length?routine/entities.length:null,
  unresolvedClockObservations:successes.reduce((sum,s)=>sum+s.unresolvedClocks,0),publicationApproved:false,
  limitations:['Initial baseline is not newly discovered supply.','Date/status revisions can mean a reschedule or a refreshed recurring meeting; they are not automatically errors or new events.','Protocol meetings are a proxy for routine events, not proof of low usefulness.','Unavailable cache/history must not be silently treated as a complete pilot history.','Technical observations do not measure usefulness on the production page.']};
}
function nextAllowed(now,request){
 let deadline=now+HOURS_6;
 if(request?.retryAfter){const seconds=Number(request.retryAfter),at=Number.isFinite(seconds)?now+Math.max(0,seconds)*1000:Date.parse(request.retryAfter);if(Number.isFinite(at))deadline=Math.max(deadline,at);}
 if(request?.rateReset&&request?.status===403){const at=Number(request.rateReset)*1000;if(Number.isFinite(at))deadline=Math.max(deadline,at);}
 return new Date(deadline).toISOString();
}
function errorKind(status,error){if(status===403||status===429)return 'rate-limit-or-access';if(!status)return 'network';if(status!==200)return 'http';return error?'invalid-data':null;}
async function runPilot({mode='probe',enabled=false,startAt,now=Date.now(),artifactDir,stateDir,scratchDir,fetchImpl=fetch,env=process.env}={}){
 if(!artifactDir||!stateDir||!scratchDir)throw Error('Pilot artifact/state/scratch directories required');
 const p=policy({mode,enabled,startAt,now}),checkedAt=new Date(now).toISOString();
 const protectedFiles=['data/crypto-calendar.json','data/macro-calendar.json','scripts/crypto-calendar/adapters/ethereum-protocol-calls.cjs','scripts/crypto-calendar/sources.cjs'];
 const root=path.resolve(__dirname,'../..'),before=await Promise.all(protectedFiles.map(async f=>[f,hash(await fs.readFile(path.join(root,f),'utf8'))]));
 await fs.mkdir(artifactDir,{recursive:true});
 const base={schemaVersion:1,mode,checkedAt,runner:{githubActions:env.GITHUB_ACTIONS==='true',environment:env.RUNNER_ENVIRONMENT||'local',runId:env.GITHUB_RUN_ID||null,runAttempt:env.GITHUB_RUN_ATTEMPT||null,commit:env.GITHUB_SHA||null},publicationApproved:false};
 if(env.GITHUB_ACTIONS==='true'&&env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('Pilot requires a GitHub-hosted runner');
 if(!p.allowed){const receipt={...base,status:'not-running',reason:p.reason,startAt:p.startAt||null,endAt:p.endAt||null,requests:0};await atomicJson(path.join(artifactDir,'receipt.json'),receipt);return receipt;}
 const stateFile=path.join(stateDir,'history.json');
 let state=mode==='sample'?await readCache(stateFile):null;
 const historyRestored=state!==null;
 state=state?validateState(state,p.startAt):emptyState(p.startAt||null);
 if(state.lastAttemptAt&&Date.parse(state.lastAttemptAt)>now)throw Error('Future pilot history is not trusted');
 const blocked=mode==='sample'&&state.notBeforeAt&&Date.parse(state.notBeforeAt)>now;
 await fs.mkdir(scratchDir,{recursive:true});
 // Never restore source bodies. A unique scratch folder guarantees the cloud probe cannot pass from cache/304.
 const privateDir=await fs.mkdtemp(path.join(scratchDir,'capture-'));
 const requests=[];
 const wrappedFetch=async(url,options)=>{
  if(url===xlm.url&&blocked)throw Error('Pilot source backoff active');
  const request={sourceId:adapters.find(a=>a.url===url)?.id,status:null,retryAfter:null,rateReset:null};requests.push(request);
  const response=await fetchImpl(url,options);request.status=response.status;request.retryAfter=response.headers.get('retry-after');request.rateReset=response.headers.get('x-ratelimit-reset');return response;
 };
 const snapshot=await generate({now,adapters,localTest:true,force:true,cacheDir:privateDir,outputPath:path.join(privateDir,'crypto-calendar.json'),fetchImpl:wrappedFetch});
 const normalized=await readCache(path.join(privateDir,'local',xlm.id+'.last-good.json'));
 const raw=await readCache(path.join(privateDir,xlm.id+'.json'));
 const response=requests.find(r=>r.sourceId===xlm.id),source=snapshot.sources[xlm.id];
 const successful=source.status==='fresh'&&source.transport==='http-200'&&raw?.receipt?.httpStatus===200&&raw.receipt.checkedAt===checkedAt&&raw.verifiedAt===checkedAt&&raw.receipt.bytes>0&&/^[a-f0-9]{64}$/.test(raw.receipt.sha256);
 const inspected=successful?xlm.inspect(raw.data,raw.verifiedAt,now):null;
 const events=successful?normalized.events:[];
 const sample={checkedAt,xlmOutcome:blocked?'backoff-skip':successful?'success':'failure',httpStatus:response?.status??null,errorKind:blocked?null:errorKind(response?.status,source.error),
  verifiedAt:successful?source.verifiedAt:state.lastVerifiedAt,eligibleXlm:successful?events.length:null,displayedXlm:snapshot.events.filter(e=>e.token==='XLM').length,
  eligibleEth:snapshot.sources[adapters[0].id].eligibleEvents,ethStatus:snapshot.sources[adapters[0].id].status,
  duplicateRecords:inspected?.duplicateRecords??null,unresolvedClocks:successful?events.filter(e=>e.sourceStartTime&&e.startsAt===null).length:null,
  technicalRecords:inspected?.technicalEvents.length??null,newIdentitiesAfterBaseline:null,dateOrStatusRevisions:null};
 if(!blocked){state.lastAttemptAt=checkedAt;state.notBeforeAt=nextAllowed(now,response);}
 if(successful){observe(state,events,sample);state.lastVerifiedAt=source.verifiedAt;}
 state.samples.push(sample);
 validateState(state,state.startAt);
 if(state.samples.length>500)throw Error('Pilot history limit reached');
 const after=await Promise.all(protectedFiles.map(async f=>[f,hash(await fs.readFile(path.join(root,f),'utf8'))]));
 if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Pilot changed protected production files');
 const receipt={...base,status:sample.xlmOutcome,startAt:p.startAt||null,endAt:p.endAt||null,historyRestored,requests:requests.length,sample,
  fetch:successful?{httpStatus:200,bytes:raw.receipt.bytes,sha256:raw.receipt.sha256,checkedAt:raw.receipt.checkedAt}:null,
  coldHttp200Passed:successful,protectedFilesUnchanged:true,publicRecords:0,publicArtifactFields:'Counters and hashed identities only; no source titles, event URLs, dates, descriptions or raw HTML.',
  displayedCounts:Object.fromEntries(['ETH','XLM'].map(t=>[t,snapshot.events.filter(e=>e.token===t).length]))};
 const aggregate=summary(state);
 await atomicJson(path.join(artifactDir,'receipt.json'),receipt);
 await atomicJson(path.join(artifactDir,'history.redacted.json'),state);
 await atomicJson(path.join(artifactDir,'summary.json'),aggregate);
 if(mode==='sample')await atomicJson(stateFile,state);
 return receipt;
}
module.exports={policy,emptyState,validateState,observe,summary,nextAllowed,runPilot,HOURS_6,PILOT_END_AT,PILOT_END_MS};
