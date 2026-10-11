// Shared normalized crypto calendar contract; no source-specific or DOM logic.
(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.CryptoCalendarModel=factory();
})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  'use strict';
  const TIME_ZONE='Europe/Warsaw',MAX_AGE_MS=6*3600000;
  const civil=new Intl.DateTimeFormat('en-GB',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
  function validDay(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s;}
  function timestamp(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(s)||!validDay(s.slice(0,10))||+s.slice(11,13)>23||+s.slice(14,16)>59||+s.slice(17,19)>59)return null;const n=Date.parse(s);return Number.isFinite(n)?n:null;}
  function day(ms){const p=Object.fromEntries(civil.formatToParts(ms).map(p=>[p.type,p.value]));return p.year+'-'+p.month+'-'+p.day;}
  function addDays(s,n){return new Date(Date.parse(s+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);}
  function windowAt(now){const from=day(now);return {from,toExclusive:addDays(from,30),timezone:TIME_ZONE};}
  function safeUrl(s){try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}}
  function normalizeEvent(e){
    const at=e?.startsAt===null?null:timestamp(e?.startsAt);
    if(!e||typeof e.id!=='string'||!e.id||e.id.length>400||typeof e.token!=='string'||! /^[A-Z0-9]{1,12}$/.test(e.token)||!validDay(e.date)||
      (e.startsAt!==null&&at===null)||(at!==null&&day(at)!==e.date)||
      !['high','medium','low'].includes(e.priority)||['title','description','category','sourceId'].some(k=>typeof e[k]!=='string'||!e[k].trim())||
      !safeUrl(e.sourceUrl)||timestamp(e.verifiedAt)===null)throw new Error('Nieprawidłowe wydarzenie krypto');
    return {...e};
  }
  function mergeEvents(events){
    const ids=new Map(),facts=new Map();
    for(const raw of events){const e=normalizeEvent(raw),old=ids.get(e.id);
      if(old&&(old.startsAt!==e.startsAt||old.date!==e.date||old.token!==e.token))throw new Error('Sprzeczne terminy wydarzenia '+e.id);
      if(!old||e.verifiedAt>old.verifiedAt)ids.set(e.id,e);
    }
    for(const e of ids.values()){const key=JSON.stringify([e.token,e.title,e.startsAt||e.date]);const old=facts.get(key);if(!old||e.verifiedAt>old.verifiedAt)facts.set(key,e);}
    return [...facts.values()].sort((a,b)=>(a.startsAt||a.date).localeCompare(b.startsAt||b.date)||a.id.localeCompare(b.id));
  }
  function selectUpcoming(events,now,limit=5){const range=windowAt(now);return mergeEvents(events).filter(e=>e.date>=range.from&&e.date<range.toExclusive&&(e.startsAt===null||timestamp(e.startsAt)>=now)).slice(0,limit);}
  function sourceIsStale(s,now){const at=timestamp(s?.verifiedAt);return !s||!['fresh','cached'].includes(s.status)||at===null||now-at>MAX_AGE_MS;}
  function parseSnapshot(data,now){
    const generated=timestamp(data?.generatedAt),w=data?.window;
    if(data?.schemaVersion!==1||data.mode!=='local-prototype'||data.displayTimezone!==TIME_ZONE||generated===null||generated>now+300000||!w||w.timezone!==TIME_ZONE||!validDay(w.from)||w.toExclusive!==addDays(w.from,30)||w.from!==day(generated)||day(now)>=w.toExclusive||!Array.isArray(data.events)||data.events.length>2000||!data.sources||typeof data.sources!=='object'||Array.isArray(data.sources)||!Object.keys(data.sources).length)throw new Error('Nieprawidłowy lub wygasły kalendarz krypto');
    for(const [id,s] of Object.entries(data.sources)){
      const verified=s?.verifiedAt===null?null:timestamp(s?.verifiedAt);
      if(!s||!safeUrl(s.url)||typeof s.name!=='string'||!s.name.trim()||!['fresh','cached','stale','unavailable'].includes(s.status)||timestamp(s.checkedAt)!==generated||verified===null&&s.verifiedAt!==null||verified!==null&&verified>generated||s.status==='unavailable'&&verified!==null||['fresh','cached'].includes(s.status)&&verified===null)throw new Error('Nieprawidłowy stan źródła '+id);
    }
    const events=mergeEvents(data.events);
    for(const e of events){const s=data.sources[e.sourceId];if(!s||e.verifiedAt!==s.verifiedAt||e.date<w.from||e.date>=w.toExclusive||e.startsAt!==null&&timestamp(e.startsAt)<generated)throw new Error('Wydarzenie poza zakresem lub źródłem');}
    return {...data,events};
  }
  return {TIME_ZONE,MAX_AGE_MS,validDay,timestamp,day,windowAt,safeUrl,normalizeEvent,mergeEvents,selectUpcoming,sourceIsStale,parseSnapshot};
});
