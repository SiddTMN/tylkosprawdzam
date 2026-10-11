'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');
const {parseIcs,inspectOpenGov,ALTERNATIVE_SOURCES,makeWindow,deduplicate,approvedEventUrl,getSource,parseArgs}=require('../scripts/test-crypto-calendar.cjs');
const checked='2026-10-11T12:00:00Z',window=makeWindow(Date.parse(checked));const eth=ALTERNATIVE_SOURCES[0],sdf=ALTERNATIVE_SOURCES[2];
// Synthetic fixtures belong only to tests, never to real event output.
const wrap=body=>'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\n'+body+'\r\nEND:VCALENDAR\r\n';
const event=(body,uid='fixture')=>'BEGIN:VEVENT\r\nUID:'+uid+'\r\nSUMMARY:All Core Devs - Test fixture\r\nSTATUS:CONFIRMED\r\n'+body+'\r\nEND:VEVENT';
const parse=body=>parseIcs(wrap(body),checked,eth,window);
test('ICS uses DTSTART, never DTSTAMP publication time; missing DTSTART fails',()=>{
 assert.equal(parse(event('DTSTART:20261010T140000Z\r\nDTEND:20261010T150000Z\r\nDTSTAMP:20261020T140000Z')).events.length,0);
 assert.throws(()=>parse(event('DTSTAMP:20261020T140000Z')));
});
test('ICS rejects impossible dates and floating or unknown timezones',()=>{
 assert.throws(()=>parse(event('DTSTART:20260230T140000Z\r\nDTEND:20260230T150000Z')),/Invalid ICS date/);
 assert.throws(()=>parse(event('DTSTART:20261020T140000\r\nDTEND:20261020T150000')),/floating/);
 assert.throws(()=>parse(event('DTSTART;TZID=Unknown/Zone:20261020T140000\r\nDTEND;TZID=Unknown/Zone:20261020T150000')),/floating/);
});
test('all-day ICS keeps unknown hour and exclusive DTEND',()=>{
 const e=parse(event('DTSTART;VALUE=DATE:20261028\r\nDTEND;VALUE=DATE:20261030')).events[0];
 assert.equal(e.date,'2026-10-28');assert.equal(e.time,null);assert.equal(e.startsAt,null);assert.equal(e.endDateExclusive,'2026-10-30');
});
test('organizer RRULE honors COUNT, EXDATE and moved and cancelled exceptions',()=>{
 const master=event('DTSTART:20261012T140000Z\r\nDTEND:20261012T150000Z\r\nRRULE:FREQ=WEEKLY;COUNT=5\r\nEXDATE:20261019T140000Z');
 const moved=event('RECURRENCE-ID:20261026T140000Z\r\nDTSTART:20261027T150000Z\r\nDTEND:20261027T160000Z');
 const cancelled=event('RECURRENCE-ID:20261102T140000Z\r\nDTSTART:20261102T140000Z\r\nDTEND:20261102T150000Z').replace('STATUS:CONFIRMED','STATUS:CANCELLED');
 assert.deepEqual(parse(master+'\r\n'+moved+'\r\n'+cancelled).events.map(e=>e.date),['2026-10-12','2026-10-27','2026-11-09']);
});
test('TZID and VTIMEZONE apply daylight saving transition to recurrence',()=>{
 const tz='BEGIN:VTIMEZONE\r\nTZID:Europe/Warsaw\r\nBEGIN:STANDARD\r\nDTSTART:19701025T030000\r\nRRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\r\nTZOFFSETFROM:+0200\r\nTZOFFSETTO:+0100\r\nEND:STANDARD\r\nBEGIN:DAYLIGHT\r\nDTSTART:19700329T020000\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\r\nTZOFFSETFROM:+0100\r\nTZOFFSETTO:+0200\r\nEND:DAYLIGHT\r\nEND:VTIMEZONE';
 const p=parse(tz+'\r\n'+event('DTSTART;TZID=Europe/Warsaw:20261020T140000\r\nDTEND;TZID=Europe/Warsaw:20261020T150000\r\nRRULE:FREQ=WEEKLY;COUNT=2'));
 assert.deepEqual(p.events.map(e=>e.startsAt),['2026-10-20T12:00:00.000Z','2026-10-27T13:00:00.000Z']);
});
test('ICS duplicate UID revision handling and distinct UID fact deduplication',()=>{
 const a=event('DTSTART:20261020T140000Z\r\nDTEND:20261020T150000Z\r\nSEQUENCE:1');
 assert.equal(parse(a+'\r\n'+a).events.length,1);
 const changed=a.replaceAll('20261020','20261021');assert.throws(()=>parse(a+'\r\n'+changed),/Conflicting ICS revision/);
 assert.equal(parse(a+'\r\n'+changed.replace('SEQUENCE:1','SEQUENCE:2')).events[0].date,'2026-10-21');
 assert.equal(parse(a+'\r\n'+a.replace('UID:fixture','UID:other')).events.length,1);
});
test('tentative Luma status remains visible in review records, not granted a licence',()=>{
 const p=parseIcs(wrap(event('DTSTART:20261013T150000Z\r\nDTEND:20261013T160000Z').replace('STATUS:CONFIRMED','STATUS:TENTATIVE')),checked,sdf,window);
 assert.equal(p.events[0].reuse,'review-required');assert.equal(p.events[0].publisherStatus,'TENTATIVE');assert.ok(p.events[0].reviewReasons.includes('publisher-status-tentative'));
});
test('past conferences, cancellations and social side events do not fill calendar',()=>{
 assert.equal(parse(event('DTSTART:20261020T140000Z\r\nDTEND:20261020T150000Z').replace('STATUS:CONFIRMED','STATUS:CANCELLED')).events.length,0);
 const p=parseIcs(wrap(event('DTSTART:20261026T140000Z\r\nDTEND:20261026T150000Z')),checked,ALTERNATIVE_SOURCES[3],window);
 assert.equal(p.events.length,0);assert.equal(p.futureDated,1);assert.match(p.rejected[0].reason,/social/);
});
test('bounded recurrence and approved source URL rules are preserved',()=>{
 assert.throws(()=>parse(event('DTSTART:20261020T140000Z\r\nDTEND:20261020T150000Z\r\nRRULE:FREQ=SECONDLY')),/high-frequency/);
 assert.equal(approvedEventUrl('https://github.com.evil.test/x'),false);assert.equal(approvedEventUrl('https://luma.com/stellar-ap4y'),true);assert.equal(approvedEventUrl('https://user:secret@luma.com/x'),false);
 const e=parse(event('DTSTART:20261020T140000Z\r\nDTEND:20261020T150000Z')).events[0];assert.throws(()=>deduplicate([{...e,sourceUrl:'https://evil.test/'}]),/Invalid normalized/);
 assert.equal(parseArgs(['--alternatives']).alternatives,true);assert.throws(()=>parseArgs(['--alternatives','--output','index.html']),/must stay inside/);
});
test('OpenGov active state, historical dates and block fields never yield forecast events',()=>{
 const p=inspectOpenGov([{referendum_index:1950,outcome:'Ongoing',end_date:'NaT',end_block:0,chain:'polkadot_asset_hub',start_date:'2026-09-15',deciding:{since:33015096},decisionPeriod:403200,enactment:{at:0}},{referendum_index:1944,outcome:'Approved',end_date:'2026-10-07',end_block:21532708}]);
 assert.deepEqual(p.events,[]);assert.equal(p.monitoring.length,1);assert.equal(p.monitoring[0].endDate,null);assert.equal(p.monitoring[0].endBlock,null);assert.equal(p.rejected.length,2);
 assert.throws(()=>inspectOpenGov({items:[]}),/schema/);
});
test('ICS 12-hour cache does not reverify an 8-hour-old snapshot',async()=>{
 const base=path.resolve(__dirname,'../docs/crypto-calendar-stage1/.cache');await fs.mkdir(base,{recursive:true});const dir=await fs.mkdtemp(path.join(base,'test-cache-'));
 const src={...sdf,id:'fixture-cache'};const verifiedAt=new Date(Date.now()-8*3600000).toISOString();const file=path.join(dir,src.id+'.json');
 try {await fs.writeFile(file,JSON.stringify({url:src.url,verifiedAt,data:wrap(''),etag:'"fixture"'}));let requests=0;const p=await getSource(src,{cacheDir:dir,onRequest:()=>requests++});assert.equal(requests,0);assert.equal(p.verifiedAt,verifiedAt);assert.equal(p.transport,'cache-not-reverified');}
 finally {await fs.unlink(file);await fs.rmdir(dir);}
});
test('HTTP 403/429 are not retried or bypassed; wrong content type fails',async()=>{
 const base=path.resolve(__dirname,'../docs/crypto-calendar-stage1/.cache');const dir=await fs.mkdtemp(path.join(base,'test-http-'));const original=global.fetch;
 try {for (const status of [403,429]) {let count=0;global.fetch=async()=>{count++;return new Response('denied',{status,headers:{'retry-after':'3600'}});};await assert.rejects(getSource({...sdf,id:'fixture-http'},{cacheDir:dir}),new RegExp('HTTP '+status));assert.equal(count,1);}
 global.fetch=async()=>new Response('<html>login</html>',{status:200,headers:{'content-type':'text/html'}});await assert.rejects(getSource({...sdf,id:'fixture-http'},{cacheDir:dir}),/content type/);
 } finally {global.fetch=original;await fs.rmdir(dir);}
});

test('cancelled override without DTSTART and EXDATE overrides cannot resurrect occurrences',()=>{
 const master=event('DTSTART:20261012T140000Z\r\nDTEND:20261012T150000Z\r\nRRULE:FREQ=WEEKLY;COUNT=2');
 const cancelled='BEGIN:VEVENT\r\nUID:fixture\r\nRECURRENCE-ID:20261019T140000Z\r\nSTATUS:CANCELLED\r\nEND:VEVENT';
 assert.deepEqual(parse(master+'\r\n'+cancelled).events.map(x=>x.date),['2026-10-12']);
 const excluded=master.replace('RRULE:FREQ=WEEKLY;COUNT=2','RRULE:FREQ=WEEKLY;COUNT=2\r\nEXDATE:20261019T140000Z');
 const override=event('RECURRENCE-ID:20261019T140000Z\r\nDTSTART:20261020T140000Z\r\nDTEND:20261020T150000Z');
 assert.deepEqual(parse(excluded+'\r\n'+override).events.map(x=>x.date),['2026-10-12']);
});
