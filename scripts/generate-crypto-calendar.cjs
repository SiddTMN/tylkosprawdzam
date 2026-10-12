'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {atomicJson,readCache}=require('./crypto-calendar/shared.cjs');
const model=require('../js/crypto-calendar-model.js');
const defaultAdapters=require('./crypto-calendar/sources.cjs');
const ROOT=path.resolve(__dirname,'..');
async function generate({now=Date.now(),adapters=defaultAdapters,cacheDir=path.join(ROOT,'docs/crypto-calendar-stage1/.cache'),outputPath=path.join(ROOT,'data/crypto-calendar.json'),fetchImpl=fetch,offline=false,force=false,timeoutMs=15000,localTest=false}={}){
  if(!adapters.length||new Set(adapters.map(a=>a.id)).size!==adapters.length||adapters.some(a=>! /^[a-z0-9-]+$/.test(a.id)||!model.safeUrl(a.url)))throw new Error('Invalid adapter registry');
  const resolvedOutput=path.resolve(outputPath).toLowerCase(),publicData=path.join(ROOT,'data').toLowerCase();
  if(adapters.some(a=>a.localOnly)&&(resolvedOutput===publicData||resolvedOutput.startsWith(publicData+path.sep)))throw new Error('Local-only sources cannot write production data; use a separate preview output');
  const sources={},events=[];let requests=0;
  const checkedAt=new Date(now).toISOString();
  for(const adapter of adapters){
    const goodFile=path.join(cacheDir,'local',adapter.id+'.last-good.json');
    const stateFile=path.join(cacheDir,'local',adapter.id+'.state.json');
    let lastFailure=null;try{const state=await readCache(stateFile);if(state?.url===adapter.url&&model.timestamp(state.failedAt)!==null&&model.timestamp(state.failedAt)<=now)lastFailure=state;}catch{};
    let previous=null;
    try{const p=await readCache(goodFile);if(p&&p.url===adapter.url&&p.id===adapter.id&&model.timestamp(p.verifiedAt)!==null&&model.timestamp(p.verifiedAt)<=now&&Array.isArray(p.events)){
      const list=model.mergeEvents(p.events);if(list.every(e=>e.sourceId===adapter.id&&e.verifiedAt===p.verifiedAt))previous={...p,events:list};
    }}catch{/* Invalid persisted data are never a trusted fallback. */}
    try{
      const result=await adapter.load({now,cacheDir,fetchImpl,offline,force,timeoutMs,localTest,onRequest:()=>requests++});
      const verified=model.timestamp(result.verifiedAt);
      if(verified===null||verified>now||!Array.isArray(result.events))throw new Error('Invalid adapter result');
      const list=model.mergeEvents(result.events);
      if(list.some(e=>e.sourceId!==adapter.id||e.verifiedAt!==result.verifiedAt))throw new Error('Adapter identity mismatch');
      const future=model.selectUpcoming(list,now,Infinity);
      sources[adapter.id]={name:adapter.name,url:adapter.url,checkedAt,verifiedAt:result.verifiedAt,
        status:now-verified>model.MAX_AGE_MS?'stale':result.transport==='cache-not-reverified'?'cached':'fresh',
        transport:result.transport,reuse:'review-required',eligibleEvents:future.length};
      if(result.transport==='cache-not-reverified'&&lastFailure&&model.timestamp(lastFailure.failedAt)>=verified){sources[adapter.id].status='stale';sources[adapter.id].error=lastFailure.error;}
      else if(result.transport!=='cache-not-reverified')await atomicJson(stateFile,{url:adapter.url,failedAt:null});
      // Store all normalized upcoming records before the display's five-row limit.
      await atomicJson(goodFile,{id:adapter.id,url:adapter.url,verifiedAt:result.verifiedAt,events:future});
      events.push(...future);
    }catch(error){
      const errorText=error.message+(error.cause?.code?' ('+error.cause.code+')':'');
      await atomicJson(stateFile,{url:adapter.url,failedAt:checkedAt,error:errorText});
      const retained=previous?model.selectUpcoming(previous.events,now,Infinity):[];
      sources[adapter.id]={name:adapter.name,url:adapter.url,checkedAt,verifiedAt:previous?.verifiedAt||null,
        status:previous?'stale':'unavailable',error:errorText,reuse:'review-required',eligibleEvents:retained.length};
      events.push(...retained);
    }
    if(adapter.publication)sources[adapter.id].publication=adapter.publication;
  }
  const snapshot={schemaVersion:1,mode:'local-prototype',publication:{approved:false,reason:'Systematic collection and public ICS reuse require clarification.'},generatedAt:checkedAt,displayTimezone:model.TIME_ZONE,window:model.windowAt(now),sources,requests,events:model.selectUpcoming(events,now,5)};
  model.parseSnapshot(snapshot,now);
  await atomicJson(outputPath,snapshot);
  return snapshot;
}
function parseArgs(args){const options={};for(const a of args){if(a==='--offline')options.offline=true;else if(a==='--force')options.force=true;else throw new Error('Unknown argument: '+a);}if(options.force&&options.offline)throw new Error('Use either --force or --offline');return options;}
if(require.main===module)generate(parseArgs(process.argv.slice(2))).then(s=>{console.log(JSON.stringify({events:s.events.length,generatedAt:s.generatedAt,requests:s.requests,sources:s.sources},null,2));if(Object.values(s.sources).some(x=>!['fresh','cached'].includes(x.status)))process.exitCode=2;}).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={generate,parseArgs};
