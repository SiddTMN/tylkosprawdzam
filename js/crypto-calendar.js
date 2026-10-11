(()=>{
  'use strict';
  const container=document.getElementById('crypto-calendar-events');
  if(!container)return;
  const note=document.getElementById('crypto-calendar-status');
  const M=CryptoCalendarModel;
  const dateFormat=new Intl.DateTimeFormat('pl-PL',{timeZone:M.TIME_ZONE,day:'2-digit',month:'short'});
  const timeFormat=new Intl.DateTimeFormat('pl-PL',{timeZone:M.TIME_ZONE,hour:'2-digit',minute:'2-digit'});
  const verifiedFormat=new Intl.DateTimeFormat('pl-PL',{timeZone:M.TIME_ZONE,dateStyle:'short',timeStyle:'short'});
  let busy=false,lastResult=null;
  function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
  function show(result,failed=false){
    const now=Date.now(),events=M.selectUpcoming(result.events,now);
    const unhealthy=failed||Object.values(result.sources).some(s=>M.sourceIsStale(s,now));
    container.replaceChildren();
    container.setAttribute('data-stale',String(unhealthy));
    if(!events.length)container.append(el('div','calendar-loading',unhealthy?'kalendarz krypto niedostępny — nie udało się potwierdzić danych':'brak nadchodzących wydarzeń krypto w ciągu 30 dni'));
    for(const event of events){
      const stale=failed||M.sourceIsStale(result.sources[event.sourceId],now);
      const at=event.startsAt?Date.parse(event.startsAt):Date.parse(event.date+'T12:00:00Z');
      const row=el('div','calendar-event');row.setAttribute('data-source',event.sourceId);row.setAttribute('data-stale',String(stale));
      const date=el('div','calendar-date');date.append(el('span','',dateFormat.format(at).toUpperCase()),el('strong','',event.startsAt?timeFormat.format(at):'—'));
      const info=el('div','calendar-info'),title=el('strong','');
      const link=el('a','crypto-event-link',event.token+' — '+event.title);link.href=event.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';title.append(link);
      info.append(title,el('span','',event.description));
      if(stale)info.append(el('span','crypto-stale-note','nieświeże dane · weryfikacja '+verifiedFormat.format(Date.parse(event.verifiedAt))));
      row.title='Źródło: '+result.sources[event.sourceId].name+'; weryfikacja: '+verifiedFormat.format(Date.parse(event.verifiedAt));
      row.append(date,info,el('span','calendar-impact '+event.priority,event.priority.toUpperCase()));container.append(row);
    }
    if(note){const times=Object.values(result.sources).map(s=>M.timestamp(s.verifiedAt)).filter(t=>t!==null);const latest=times.length?Math.max(...times):null;
      note.textContent=(unhealthy?'nieświeże dane / błąd aktualizacji':result.mode==='automated-calendar'?'kalendarz aktualizowany automatycznie':'wersja lokalna')+' · czas: Warszawa'+(latest!==null?' · weryfikacja '+verifiedFormat.format(latest):'');
    }
  }
  async function update(){
    if(busy)return;busy=true;container.setAttribute('aria-busy','true');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch('./data/crypto-calendar.json',{signal:controller.signal,cache:'no-store'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const result=M.parseSnapshot(await response.json(),Date.now());
      // An older file must not replace newer known-good data during an outage.
      if(lastResult&&result.generatedAt<lastResult.generatedAt)show(lastResult,true);
      else {lastResult=result;show(result);}
    }catch(error){
      console.warn('Aktualizacja kalendarza krypto nie powiodła się:',error);
      if(lastResult)show(lastResult,true);
      else {container.replaceChildren(el('div','calendar-loading','kalendarz krypto niedostępny — błąd pobierania danych'));container.setAttribute('data-stale','true');if(note)note.textContent='błąd pobierania · czas: Warszawa';}
    }finally{clearTimeout(timer);busy=false;container.setAttribute('aria-busy','false');}
  }
  update();setInterval(update,60000);
})();
