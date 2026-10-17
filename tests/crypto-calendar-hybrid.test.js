'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {M,now,event,auto,manual}=require('./helpers/crypto-hybrid.cjs');
const man=patch=>event({origin:'manual',...patch});
test('independent datasets merge without mutating or losing manual data',()=>{
 const a=auto([event()]),m=manual([man({id:'manual-btc',assets:['BTC']})]),before=JSON.stringify([a,m]);
 assert.equal(M.mergeDatasets(a,m,now).length,2);assert.equal(JSON.stringify([a,m]),before);
 assert.equal(M.mergeDatasets(auto(),m,now).length,1);
});
test('manual same ID and explicit corrections override auto date/status/confidence',()=>{
 for(const correction of [man({period:{precision:'month',month:'2026-10'},confidence:'expected',status:'postponed'}),man({id:'correction',overridesId:'eth-pm:9001',status:'cancelled'})]){
  const result=M.mergeDatasets(auto([event()]),manual([correction]),now);assert.equal(result.length,1);assert.equal(result[0].origin,'manual');assert.equal(result[0].status,correction.status);
 }
});
test('equivalent factual events deduplicate across IDs, source URLs and JSON key order',()=>{
 const result=M.mergeDatasets(auto([event(),event({id:'copy',title:'  FIXTURE  only ',period:{date:'2026-10-15',precision:'day'},sourceUrl:'https://example.org/other'})]),manual([man({id:'human-copy'})]),now);
 assert.equal(result.length,1);assert.equal(result[0].id,'human-copy');
});

test('audit regression: same-id and overridesId manual corrections of one automatic event fail in either order',()=>{
 const sameId=man({status:'cancelled'}),alias=man({id:'human-correction',overridesId:sameId.id,status:'postponed',period:{precision:'day',date:'2026-10-16'}});
 for(const events of [[sameId,alias],[alias,sameId]]){
  const m=manual(events),before=JSON.stringify(m);
  assert.throws(()=>M.parseDataset(m,'manual',now),/Sprzeczne korekty eth-pm:9001/);
  for(const a of [auto([event()]),auto()])assert.throws(()=>M.mergeDatasets(a,m,now),/Sprzeczne korekty eth-pm:9001/);
  assert.equal(JSON.stringify(m),before);
 }
});

test('manual correction targets cannot collide with another manual ID, including alias chains',()=>{
 const a=man({id:'a',overridesId:'eth-pm:9001'}),b=man({id:'b',overridesId:'a'});
 for(const events of [[a,b],[b,a]])assert.throws(()=>M.parseDataset(manual(events),'manual',now),/Sprzeczne korekty a/);
 const independent=manual([a,man({id:'separate',overridesId:'eth-pm:9002',title:'Other correction'})]);
 assert.equal(M.mergeDatasets(auto([event(),event({id:'eth-pm:9002',title:'Other fixture'})]),independent,now).length,2);
 // A redundant self-target remains a valid single correction.
 assert.equal(M.mergeDatasets(auto([event()]),manual([man({overridesId:'eth-pm:9001'})]),now).length,1);
});
test('distinct assets and distinct networks/titles stay distinct',()=>{
 assert.equal(M.mergeDatasets(auto(),manual([man({id:'eth',title:'Fork — Mainnet'}),man({id:'testnet',title:'Fork — Testnet'}),man({id:'btc',assets:['BTC'],title:'Fork — Mainnet'})]),now).length,3);
});
test('dates validate Gregorian calendar and enforce actual Monday–Sunday weeks',()=>{
 for(const period of [{precision:'day',date:'2026-02-29'},{precision:'month',month:'2026-13'},{precision:'range',from:'2026-10-15',to:'2026-10-14'},{precision:'week',from:'2026-10-13',to:'2026-10-19'},{precision:'day',date:'2026-10-15',month:'2026-10'},{precision:'quarter',from:'2026-10-01',to:'2026-12-31'}])assert.throws(()=>M.hybridEvent(man({period}),'manual',now));
 assert.deepEqual(M.periodBounds({precision:'month',month:'2028-02'}),{from:'2028-02-01',to:'2028-02-29'});
});
test('month/week overlap today without invented exact date/hour; finished events excluded',()=>{
 const m=man({period:{precision:'month',month:'2026-10'}}),w=man({id:'week',period:{precision:'week',from:'2026-10-12',to:'2026-10-18'}});
 const merged=M.mergeDatasets(auto(),manual([m,w,man({id:'done',status:'completed'})]),now);
 assert.equal(M.upcomingHybrid(merged,now).length,2);assert.equal(merged[0].period.date,undefined);assert.equal(merged[0].startsAt,null);
 assert.match(M.periodLabel(m.period),/październik 2026/);assert.match(M.periodLabel(w.period),/tydz/);
});
test('30-day Warsaw window includes intersecting periods but excludes future and expired ranges',()=>{
 const dates=[{precision:'range',from:'2026-10-10',to:'2026-10-14'},{precision:'day',date:'2026-11-11'},{precision:'day',date:'2026-11-12'},{precision:'month',month:'2026-09'}];
 const events=dates.map((period,i)=>man({id:'date-'+i,period}));assert.equal(M.upcomingHybrid(events,now,Infinity).length,2);
});
test('hour must match a precise Warsaw day; month/week may not invent timestamps',()=>{
 const e=man({period:{precision:'day',date:'2026-10-16'},startsAt:'2026-10-15T23:00:00Z'});
 assert.doesNotThrow(()=>M.hybridEvent(e,'manual',now));
 for(const bad of [{...e,period:{precision:'day',date:'2026-10-15'}},{...e,period:{precision:'month',month:'2026-10'}}])assert.throws(()=>M.hybridEvent(bad,'manual',now));
 assert.equal(M.upcomingHybrid([event({startsAt:'2026-10-13T11:59:00Z',period:{precision:'day',date:'2026-10-13'}})],now).length,0);
});
test('invalid assets, links, certainty, origins, future verification and repeated IDs fail',()=>{
 for(const patch of [{assets:['SOL']},{assets:[]},{assets:['ETH','ETH']},{sourceUrl:'javascript:alert(1)'},{sourceUrl:'https://user:secret@example.org'},{confidence:'maybe'},{status:'deleted'},{verifiedAt:'2026-10-14T12:00:00Z'},{id:'bad id'},{description:''},{origin:'auto'},{example:true},{draft:true}])assert.throws(()=>M.hybridEvent(man(patch),'manual',now));
 assert.throws(()=>M.parseDataset(manual([man(),man()]),'manual',now),/identyfikator/);
 assert.throws(()=>M.parseDataset(manual([man({id:'a',overridesId:'old'}),man({id:'b',overridesId:'old'})]),'manual',now),/korekty/);
});
test('project approval cannot replace source rights or fresh verification',()=>{
 const a=auto([event()]);a.publication={approved:true};a.sources['eth-pm'].rights={license:'CC0',licenseUrl:'https://example.org'};
 assert.throws(()=>M.parseDataset(a,'auto',now),/podstawy/);
 const unavailable=auto([event()]);unavailable.sources['eth-pm'].status='unavailable';unavailable.sources['eth-pm'].verifiedAt=null;
 assert.throws(()=>M.parseDataset(unavailable,'auto',now),/weryfikacji/);
 assert.throws(()=>M.parseDataset(auto([event({confidence:'speculative'})]),'auto',now),/automatyczny/);
});
test('all six supported assets including Aethir and multi-asset events are valid manually',()=>{
 const e=man({assets:['BTC','ETH','DOT','XLM','ATH','BONK'],confidence:'speculative'});
 assert.equal(M.parseDataset(manual([e]),'manual',now).events[0].assets.length,6);assert.equal(M.ASSETS.ATH,'Aethir');
});
test('storage retains full population while UI selection remains five chronologically',()=>{
 const es=Array.from({length:12},(_,i)=>man({id:'event-'+i,title:'Fixture '+i,period:{precision:'day',date:'2026-10-'+String(14+i).padStart(2,'0')}}));
 const merged=M.mergeDatasets(auto(),manual(es),now);assert.equal(merged.length,12);assert.equal(M.upcomingHybrid(merged,now).length,5);assert.equal(M.upcomingHybrid(merged,now,Infinity).length,12);
});
test('documentation template cannot accidentally be published as a real event',()=>{
 const template=require('../docs/crypto-calendar-hybrid/crypto-manual.template.json');assert.throws(()=>M.parseDataset(template,'manual',now));
});
