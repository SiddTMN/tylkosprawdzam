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
    if(e.endDate!=null&&(!validDay(e.endDate)||e.endDate<e.date)||
      e.endDateExclusive!=null&&(!validDay(e.endDateExclusive)||e.endDateExclusive<=e.date||e.endDate!=null&&e.endDateExclusive!==addDays(e.endDate,1))||
      e.endsAt!=null&&(at===null||timestamp(e.endsAt)===null||timestamp(e.endsAt)<at))throw new Error('Nieprawidłowy koniec wydarzenia krypto');
    return {...e};
  }
  function mergeEvents(events){
    const ids=new Map(),facts=new Map();
    for(const raw of events){const e=normalizeEvent(raw),old=ids.get(e.id);
      if(old&&(old.startsAt!==e.startsAt||old.date!==e.date||old.token!==e.token||(old.endDate??null)!==(e.endDate??null)||(old.endsAt??null)!==(e.endsAt??null)||(old.endDateExclusive??null)!==(e.endDateExclusive??null)))throw new Error('Sprzeczne terminy wydarzenia '+e.id);
      if(!old||e.verifiedAt>old.verifiedAt)ids.set(e.id,e);
    }
    for(const e of ids.values()){const key=JSON.stringify([e.token,e.title.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase(),e.startsAt||e.date]);const old=facts.get(key);
      if(old&&((old.endDate??null)!==(e.endDate??null)||(old.endsAt??null)!==(e.endsAt??null)||(old.endDateExclusive??null)!==(e.endDateExclusive??null)))throw new Error('Sprzeczne końce zduplikowanego wydarzenia '+e.title);
      if(!old||e.verifiedAt>old.verifiedAt)facts.set(key,e);}
    return [...facts.values()].sort((a,b)=>(a.startsAt||a.date).localeCompare(b.startsAt||b.date)||a.id.localeCompare(b.id));
  }
  function selectUpcoming(events,now,limit=5){
    const range=windowAt(now),future=mergeEvents(events).filter(e=>e.date>=range.from&&e.date<range.toExclusive&&(e.startsAt===null||timestamp(e.startsAt)>=now));
    // Infinity is ingestion/cache selection: keep the full population for later refreshes.
    if(limit===Infinity)return future;
    if(!Number.isInteger(limit)||limit<0)throw new Error('Nieprawidłowy limit kalendarza');
    const valuable=future.filter(e=>e.priority!=='low'),multipleTokens=new Set(valuable.map(e=>e.token)).size>1;
    const counts=new Map(),selected=[];
    for(const e of valuable){if(selected.length>=Math.min(limit,5))break;const count=counts.get(e.token)||0;if(multipleTokens&&count>=3)continue;selected.push(e);counts.set(e.token,count+1);}
    return selected;
  }
  function sourceIsStale(s,now){const at=timestamp(s?.verifiedAt);return !s||!['fresh','cached'].includes(s.status)||at===null||now-at>MAX_AGE_MS;}
  function parseSnapshot(data,now){
    const generated=timestamp(data?.generatedAt),w=data?.window;
    if(data?.schemaVersion!==1||!['local-prototype','automated-calendar'].includes(data.mode)||data.displayTimezone!==TIME_ZONE||(data.mode==='automated-calendar'&&data.publication?.approved!==true)||generated===null||generated>now+300000||!w||w.timezone!==TIME_ZONE||!validDay(w.from)||w.toExclusive!==addDays(w.from,30)||w.from!==day(generated)||day(now)>=w.toExclusive||!Array.isArray(data.events)||data.events.length>5||!data.sources||typeof data.sources!=='object'||Array.isArray(data.sources)||!Object.keys(data.sources).length)throw new Error('Nieprawidłowy lub wygasły kalendarz krypto');
    for(const [id,s] of Object.entries(data.sources)){
      const verified=s?.verifiedAt===null?null:timestamp(s?.verifiedAt);
      if(!s||!safeUrl(s.url)||typeof s.name!=='string'||!s.name.trim()||!['fresh','cached','stale','unavailable'].includes(s.status)||timestamp(s.checkedAt)!==generated||verified===null&&s.verifiedAt!==null||verified!==null&&verified>generated||s.status==='unavailable'&&verified!==null||['fresh','cached'].includes(s.status)&&verified===null)throw new Error('Nieprawidłowy stan źródła '+id);
      if(data.mode==='automated-calendar'&&(s.publication?.localOnly||s.publication?.approved===false))throw new Error('Źródło dopuszczone wyłącznie do testu lokalnego '+id);
    }
    const events=mergeEvents(data.events);
    for(const e of events){const s=data.sources[e.sourceId];if(!s||e.verifiedAt!==s.verifiedAt||e.date<w.from||e.date>=w.toExclusive||e.startsAt!==null&&timestamp(e.startsAt)<generated)throw new Error('Wydarzenie poza zakresem lub źródłem');}
    if(data.mode==='automated-calendar'&&events.some(e=>e.publicationApproved===false))throw new Error('Wydarzenie niedopuszczone do publikacji');
    return {...data,events};
  }
  // Version 2: independent manual/automatic datasets. Legacy methods above remain
  // available to historical audit tools; the public renderer only accepts v2.
  const ASSETS={BTC:'Bitcoin',ETH:'Ethereum',DOT:'Polkadot',XLM:'Stellar',ATH:'Aethir',BONK:'Bonk'};
  const AUTO_MAX_AGE_MS=36*3600000;
  const CONFIDENCE={confirmed:'potwierdzone',expected:'oczekiwane',speculative:'spekulacyjne'};
  const STATUS={planned:'planowane',postponed:'przesunięte',cancelled:'odwołane',completed:'zakończone'};
  function periodBounds(p){
    if(!p||typeof p!=='object'||Array.isArray(p))throw new Error('Brak terminu wydarzenia');
    const allowed={day:['precision','date'],month:['precision','month'],week:['precision','from','to'],range:['precision','from','to']}[p.precision];
    if(!allowed||Object.keys(p).some(k=>!allowed.includes(k)))throw new Error('Nieprawidłowa precyzja terminu');
    if(p.precision==='day'&&validDay(p.date))return {from:p.date,to:p.date};
    if(p.precision==='month'&&typeof p.month==='string'&&/^\d{4}-\d{2}$/.test(p.month)&&validDay(p.month+'-01')){
      const first=p.month+'-01',d=new Date(first+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1,0);
      return {from:first,to:d.toISOString().slice(0,10)};
    }
    if(['week','range'].includes(p.precision)&&validDay(p.from)&&validDay(p.to)&&p.to>=p.from){
      if(p.precision==='week'&&(new Date(p.from+'T12:00:00Z').getUTCDay()!==1||p.to!==addDays(p.from,6)))throw new Error('Tydzień musi obejmować poniedziałek–niedzielę');
      return {from:p.from,to:p.to};
    }
    throw new Error('Nieprawidłowy termin wydarzenia');
  }
  function validId(s){return typeof s==='string'&&/^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$/.test(s);}
  function hybridEvent(e,origin,now=Date.now()){
    if(!e||e.example!==undefined||e.draft!==undefined||!validId(e.id)||e.origin!==origin||!['auto','manual'].includes(origin)||
      !Array.isArray(e.assets)||!e.assets.length||e.assets.length>6||new Set(e.assets).size!==e.assets.length||e.assets.some(a=>!Object.hasOwn(ASSETS,a))||
      typeof e.title!=='string'||!e.title.trim()||e.title.length>160||typeof e.description!=='string'||!e.description.trim()||e.description.length>360||
      !Object.hasOwn(CONFIDENCE,e.confidence)||!Object.hasOwn(STATUS,e.status)||!safeUrl(e.sourceUrl)||
      timestamp(e.verifiedAt)===null||timestamp(e.verifiedAt)>now+300000||
      e.overridesId!==undefined&&(origin!=='manual'||!validId(e.overridesId)))throw new Error('Nieprawidłowe wydarzenie hybrydowe');
    periodBounds(e.period);
    if(e.startsAt!=null&&(e.period.precision!=='day'||timestamp(e.startsAt)===null||day(timestamp(e.startsAt))!==e.period.date))throw new Error('Godzina sprzeczna z terminem');
    if(origin==='auto'&&(!validId(e.sourceId)||e.confidence!=='confirmed'||e.status!=='planned'))throw new Error('Niezweryfikowany rekord automatyczny');
    return {...e,assets:[...e.assets].sort(),period:{...e.period},startsAt:e.startsAt??null};
  }
  function parseDataset(data,origin,now=Date.now()){
    if(data?.schemaVersion!==2||data.origin!==origin||!Array.isArray(data.events)||data.events.length>2000)throw new Error('Nieprawidłowy zbiór '+origin);
    if(origin==='auto'){
      if(timestamp(data.generatedAt)===null||timestamp(data.generatedAt)>now+300000||!data.sources||typeof data.sources!=='object'||Array.isArray(data.sources))throw new Error('Nieprawidłowe źródła automatu');
      for(const [id,s] of Object.entries(data.sources)){
        if(!validId(id)||!s||!safeUrl(s.url)||typeof s.name!=='string'||!s.name||!['fresh','stale','unavailable'].includes(s.status)||
          timestamp(s.checkedAt)===null||s.checkedAt!==data.generatedAt||
          s.verifiedAt!==null&&(timestamp(s.verifiedAt)===null||timestamp(s.verifiedAt)>timestamp(data.generatedAt))||
          s.status==='fresh'&&s.verifiedAt!==s.checkedAt||s.status==='unavailable'&&s.verifiedAt!==null||
          !s.rights||s.rights.automatedAccess!==true||s.rights.publicReuse!==true||typeof s.rights.license!=='string'||!s.rights.license||!safeUrl(s.rights.licenseUrl)||!validDay(s.rights.reviewedAt))throw new Error('Brak potwierdzonej podstawy źródła '+id);
      }
    }
    const ids=new Set(),corrections=new Set(),events=data.events.map(raw=>{
      const e=hybridEvent(raw,origin,now);if(ids.has(e.id))throw new Error('Powtórzony identyfikator '+e.id);ids.add(e.id);
      // Both identifiers suppress automatic facts in mergeDatasets. Reserve both
      // here as well, so an id correction cannot coexist with an overridesId
      // correction of the same fact, regardless of input order or auto presence.
      if(origin==='manual')for(const target of new Set([e.id,...(e.overridesId?[e.overridesId]:[])])){
        if(corrections.has(target))throw new Error('Sprzeczne korekty '+target);corrections.add(target);
      }
      if(origin==='auto'){
        const s=data.sources[e.sourceId];
        if(!s||s.status!=='fresh'||e.verifiedAt!==s.verifiedAt||e.license!==s.rights.license||e.licenseUrl!==s.rights.licenseUrl)throw new Error('Wydarzenie bez świeżej weryfikacji źródła '+e.id);
      }
      return e;
    });
    return {...data,events};
  }
  function factKey(e){const b=periodBounds(e.period);return JSON.stringify([e.assets,e.title.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase(),e.period.precision,b.from,b.to,e.startsAt]);}
  function mergeDatasets(auto,manual,now=Date.now()){
    const a=parseDataset(auto,'auto',now),m=parseDataset(manual,'manual',now),ids=new Map(),facts=new Map();
    // An explicit manual correction suppresses the old automatic fact even if its
    // date/title/status changed. Neither input is mutated or written here.
    const suppressed=new Set(m.events.flatMap(e=>[e.id,...(e.overridesId?[e.overridesId]:[])]));
    for(const e of a.events)if(!suppressed.has(e.id))ids.set(e.id,e);
    for(const e of m.events)ids.set(e.id,e);
    for(const e of ids.values()){
      const key=factKey(e),previous=facts.get(key);
      if(!previous||e.origin==='manual'&&previous.origin==='auto'||e.origin===previous.origin&&e.verifiedAt>previous.verifiedAt)facts.set(key,e);
    }
    return [...facts.values()].sort((x,y)=>periodBounds(x.period).from.localeCompare(periodBounds(y.period).from)||x.id.localeCompare(y.id));
  }
  function upcomingHybrid(events,now,limit=5){
    const w=windowAt(now),future=events.filter(e=>{const b=periodBounds(e.period);return e.status!=='completed'&&b.to>=w.from&&b.from<w.toExclusive&&(e.startsAt===null||timestamp(e.startsAt)>=now);});
    return limit===Infinity?future:future.slice(0,limit);
  }
  function autoSourceIsStale(s,now){return !s||s.status!=='fresh'||timestamp(s.verifiedAt)===null||now-timestamp(s.verifiedAt)>AUTO_MAX_AGE_MS;}
  function periodLabel(p){
    const f=new Intl.DateTimeFormat('pl-PL',{timeZone:TIME_ZONE,day:'2-digit',month:'short'}),date=s=>f.format(Date.parse(s+'T12:00:00Z')).toUpperCase();
    if(p.precision==='month')return new Intl.DateTimeFormat('pl-PL',{timeZone:TIME_ZONE,month:'long',year:'numeric'}).format(Date.parse(p.month+'-01T12:00:00Z'));
    if(p.precision==='day')return date(p.date);
    return (p.precision==='week'?'tydz. ':'')+date(p.from)+' – '+date(p.to);
  }
  return {TIME_ZONE,MAX_AGE_MS,validDay,timestamp,day,windowAt,safeUrl,normalizeEvent,mergeEvents,selectUpcoming,sourceIsStale,parseSnapshot,
    ASSETS,AUTO_MAX_AGE_MS,CONFIDENCE,STATUS,periodBounds,hybridEvent,parseDataset,mergeDatasets,upcomingHybrid,autoSourceIsStale,periodLabel};
});
