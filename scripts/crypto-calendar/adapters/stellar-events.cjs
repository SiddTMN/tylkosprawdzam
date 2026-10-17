'use strict';
const crypto=require('node:crypto'),path=require('node:path');
const model=require('../../../js/crypto-calendar-model.js');
const {getSource,atomicJson,addDays}=require('../shared.cjs');
const SOURCE={id:'xlm-stellar-events',name:'Stellar Events Hub',token:'XLM',kind:'html',url:'https://stellar.org/events'};
const PUBLICATION={approved:false,localOnly:true,termsUrl:'https://stellar.org/terms-of-service',
 reason:'SDF public/commercial reuse authorization or an applicable permitted-use basis has not been established. Production collection/public republication blocked; explicit isolated technical tests only.'};
function cleanTitle(value){if(typeof value!=='string'||!value.trim()||value.length>300)throw Error('Missing/invalid Stellar event title');return value.normalize('NFKC').trim().replace(/\s+/g,' ');}
function eventUrl(row){
 const raw=row.url||row.ctas?.find(x=>x.href||x.route?.url)?.href||row.ctas?.find(x=>x.route?.url)?.route.url;
 if(typeof raw!=='string')throw Error('Missing Stellar event URL');
 const u=new URL(raw,SOURCE.url);
 if(u.protocol!=='https:'||u.username||u.password||!['stellar.org','meridian.stellar.org'].includes(u.hostname)||u.port||u.search||u.hash)throw Error('Unapproved Stellar event URL');
 u.pathname=u.pathname.replace(/\/$/,'')||'/';return u.href;
}
function classify(title){
 if(/^Meridian(?:\s+20\d{2})?$/i.test(title))return {priority:'high',category:'conference',description:'Główna konferencja ekosystemu Stellar: technologia i zastosowania sieci.'};
 if(/^HackMeridian(?:\s+20\d{2})?$/i.test(title))return {priority:'medium',category:'hackathon',description:'Hackathon poświęcony budowaniu projektów na Stellar.'};
 if(/^Stellar (?:Developer(?: and Protocol)? Meeting|Protocol (?:Meeting|Discussion))$/i.test(title))return {priority:'medium',category:'protocol-meeting',description:'Spotkanie deweloperów Stellar i omówienie rozwoju protokołu.'};
 return {priority:'low',category:'ecosystem-event',description:'Wydarzenie ekosystemu Stellar; wymaga oceny znaczenia.'};
}
function statusOf(row){
 const flags=['isCancelled','isCanceled','is_cancelled','cancelled'];
 for(const key of flags)if(row[key]!==undefined&&typeof row[key]!=='boolean')throw Error('Invalid Stellar cancellation flag');
 const values=['status','eventStatus','publisherStatus'].map(k=>row[k]).filter(v=>v!=null);
 const statuses=values.map(value=>{if(typeof value!=='string')throw Error('Invalid Stellar event status');return value.replace(/^https?:\/\/schema\.org\//,'').replace(/^Event/i,'').toLowerCase();});
 if(statuses.some(s=>!['scheduled','confirmed','cancelled','canceled','postponed','rescheduled','tentative'].includes(s)))throw Error('Unknown Stellar event status');
 if(flags.some(k=>row[k]===true)||statuses.some(s=>['cancelled','canceled'].includes(s)))return 'cancelled';
 if(statuses.includes('postponed'))return 'postponed';if(statuses.includes('tentative'))return 'tentative';
 return statuses[0]||null;
}
function inspect(body,verifiedAt,now=Date.now()){
 if(typeof body!=='string')throw Error('Expected Stellar HTML');
 const matches=[...body.matchAll(/<script\b(?=[^>]*\bid\s*=\s*["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/gi)];
 if(matches.length!==1)throw Error('Missing/ambiguous Stellar structured data');
 let data;try{data=JSON.parse(matches[0][1]);}catch{throw Error('Malformed Stellar structured JSON');}
 const page=data.props?.pageProps;
 if(!['/events',SOURCE.url].includes(page?.url)||!Array.isArray(page.content)||page.content.length>200)throw Error('Unexpected Stellar Events Hub schema');
 const rows=[];let containers=0;
 function hasEventRecord(value,depth=0){
  if(depth>40)throw Error('Stellar content nesting limit exceeded');
  if(!value||typeof value!=='object')return false;
  if(['eventCard','eventPage'].includes(value._type))return true;
  return Object.values(value).some(v=>hasEventRecord(v,depth+1));
 }
 // Only typed event records in page content. No global menus, blog dates, or pastEvents.
 for(const section of page.content){
  if(!section||typeof section._type!=='string')throw Error('Invalid Stellar content section');
  if(section._type==='cardsSection'){
   containers++;
   if(!Array.isArray(section.items)||section.items.some(r=>!['card','eventCard'].includes(r?._type)))throw Error('Invalid Stellar cards section');
   rows.push(...section.items.filter(r=>r?._type==='eventCard'));
  }else if(section._type==='cardHighlightSection'){
   containers++;
   if(!Array.isArray(section.autoEvents)||!Array.isArray(section.highlightedEvents)||!Number.isInteger(section.totalUpcomingEvents)||section.totalUpcomingEvents<0)throw Error('Invalid Stellar upcoming section');
   const entries=[...section.autoEvents,...section.highlightedEvents];
   if(entries.some(r=>!['eventPage','eventCard'].includes(r?._type)))throw Error('Unknown Stellar event record');
   const identities=new Set(entries.map(r=>r._id||r._key||r.url));
   if(identities.size<section.totalUpcomingEvents)throw Error('Incomplete Stellar upcoming listing');
   rows.push(...entries);
  }else if(hasEventRecord(section))throw Error('Unsupported Stellar event container');
 }
 if(!containers)throw Error('Missing Stellar event containers');
 if(rows.length>1000)throw Error('Too many Stellar events');
 const range=model.windowAt(now),technical=[],rejected=[],byId=new Map();let duplicateRecords=0;
 for(const row of rows){
  const title=cleanTitle(row.title),status=statusOf(row),sourceUrl=eventUrl(row);
  const sourceEventId=row._id||row._key||sourceUrl;
  if(typeof sourceEventId!=='string'||!sourceEventId||sourceEventId.length>300)throw Error('Invalid Stellar identity');
  const id=SOURCE.id+':'+crypto.createHash('sha256').update(sourceEventId).digest('hex').slice(0,24);
  if(['cancelled','postponed'].includes(status)&&!row.startDate){rejected.push({id,title,sourceUrl,reason:'publisher-'+status});continue;}
  if(!model.validDay(row.startDate)||row.endDate!=null&&(!model.validDay(row.endDate)||row.endDate<row.startDate))throw Error('Invalid Stellar start/end day');
  // startDateIso at midnight is a CMS date placeholder, not an event's clock time.
  // Preserve ambiguous publisher clock labels verbatim without guessing PST/PDT.
  const e={id,token:SOURCE.token,date:row.startDate,startsAt:null,endDate:row.endDate??null,endsAt:null,
   endDateExclusive:row.endDate?addDays(row.endDate,1):null,sourceStartDate:row.startDate,sourceEndDate:row.endDate??null,
   sourceStartTime:row.startTime??null,sourceEndTime:row.endTime??null,
   ...classify(title),title,sourceId:SOURCE.id,sourceUrl,verifiedAt,publisherStatus:status,
   timingPrecision:'day',timingNote:row.startTime?'Godzina źródłowa wymaga potwierdzenia strefy; pokazujemy wyłącznie datę.':null,
   publicationApproved:false};
  if(e.sourceStartTime!==null&&typeof e.sourceStartTime!=='string'||e.sourceEndTime!==null&&typeof e.sourceEndTime!=='string')throw Error('Invalid Stellar clock label');
  model.normalizeEvent(e);
  const prior=byId.get(id);
  const fact=x=>JSON.stringify([x.title,x.date,x.endDate,x.publisherStatus,x.sourceUrl]);
  if(prior&&fact(prior)!==fact(e))throw Error('Conflicting Stellar event identity');
  if(prior&&e.date>=range.from&&e.date<range.toExclusive)duplicateRecords++;
  byId.set(id,e);
 }
 const seen=new Map(),urlTimes=new Map();
 for(const e of byId.values()){
  const key=e.sourceUrl+'|'+e.title.toLowerCase(),previous=urlTimes.get(key);
  if(previous&&JSON.stringify([previous.date,previous.endDate])!==JSON.stringify([e.date,e.endDate]))throw Error('Conflicting Stellar duplicate dates');
  urlTimes.set(key,e);
  if(e.date<range.from||e.date>=range.toExclusive)continue;
  const fact=e.title.toLowerCase()+'|'+e.date+'|'+e.endDate;
  const prior=seen.get(fact);
  if(prior){if(prior.publisherStatus!==e.publisherStatus)throw Error('Conflicting Stellar duplicate status');duplicateRecords++;continue;}
  seen.set(fact,e);technical.push(e);
 }
 const events=[];for(const e of technical){
  const reason=['cancelled','postponed','tentative'].includes(e.publisherStatus)?'publisher-'+e.publisherStatus:e.priority==='low'?'low-priority-unreviewed':null;
  if(reason)rejected.push({id:e.id,title:e.title,date:e.date,sourceUrl:e.sourceUrl,reason});else events.push(e);
 }
 return {events:model.mergeEvents(events),technicalEvents:model.mergeEvents(technical),rejected,inspectedRecords:rows.length,duplicateRecords,publication:PUBLICATION};
}
function parse(body,verifiedAt,now){return inspect(body,verifiedAt,now).events;}
module.exports={...SOURCE,localOnly:true,publication:PUBLICATION,parse,inspect,
 async load(options={}){
  if(options.localTest!==true)throw Error('Stellar Events is restricted to an explicit local test; public collection/republication rights unresolved');
  const fetched=await getSource({...SOURCE,validateData:(body,at)=>inspect(body,at,options.now)},options);
  const result=inspect(fetched.data,fetched.verifiedAt,options.now);
  await atomicJson(path.join(options.cacheDir,SOURCE.id+'.technical.json'),{verifiedAt:fetched.verifiedAt,events:result.technicalEvents,rejected:result.rejected,publication:PUBLICATION});
  return {...result,verifiedAt:fetched.verifiedAt,transport:fetched.transport};
 }
};
