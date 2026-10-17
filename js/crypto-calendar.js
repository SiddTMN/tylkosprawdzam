(()=>{
  'use strict';
  const container=document.getElementById('crypto-calendar-events');
  if(!container)return;
  const note=document.getElementById('crypto-calendar-status'),M=CryptoCalendarModel;
  const timeFormat=new Intl.DateTimeFormat('pl-PL',{timeZone:M.TIME_ZONE,hour:'2-digit',minute:'2-digit'});
  const verifiedFormat=new Intl.DateTimeFormat('pl-PL',{timeZone:M.TIME_ZONE,dateStyle:'short',timeStyle:'short'});
  const datasets={auto:null,manual:null},failed={auto:false,manual:false};let busy=false;
  function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
  function show(){
    const now=Date.now(),empty=origin=>({schemaVersion:2,origin,events:[],...(origin==='auto'?{generatedAt:new Date(now).toISOString(),sources:{}}:{})});
    const merged=M.mergeDatasets(datasets.auto||empty('auto'),datasets.manual||empty('manual'),now);
    const events=M.upcomingHybrid(merged,now);
    const unhealthy=failed.auto||failed.manual||!datasets.auto||!datasets.manual||Object.values(datasets.auto?.sources||{}).some(s=>M.autoSourceIsStale(s,now));
    container.replaceChildren();container.setAttribute('data-stale',String(unhealthy));
    if(!events.length)container.append(el('div','calendar-loading',unhealthy?'kalendarz krypto częściowo niedostępny — nie udało się potwierdzić danych':'brak nadchodzących wydarzeń krypto w ciągu 30 dni'));
    for(const event of events){
      const stale=failed[event.origin]||event.origin==='auto'&&M.autoSourceIsStale(datasets.auto?.sources[event.sourceId],now);
      const row=el('div','calendar-event');row.setAttribute('data-origin',event.origin);row.setAttribute('data-stale',String(stale));
      const date=el('div','calendar-date'),clock=el('strong','',event.startsAt?timeFormat.format(Date.parse(event.startsAt)):'—');
      if(!event.startsAt){clock.title='Godzina nie została podana; okres orientacyjny nie oznacza dokładnej daty.';clock.setAttribute('aria-label','bez potwierdzonej godziny');}
      date.append(el('span','',M.periodLabel(event.period)),clock);
      const info=el('div','calendar-info'),title=el('strong','');
      const assetLabel=event.assets.map(a=>a+' ('+M.ASSETS[a]+')').join(', ');
      const link=el('a','crypto-event-link',assetLabel+' — '+event.title);link.href=event.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';title.append(link);
      info.append(title,el('span','',event.description));
      if(['postponed','cancelled'].includes(event.status))info.append(el('span','crypto-event-status',M.STATUS[event.status]));
      info.append(el('span','',event.origin==='manual'?'wpis ręczny':'automat'));
      if(stale)info.append(el('span','crypto-stale-note','nieświeże dane · weryfikacja '+verifiedFormat.format(Date.parse(event.verifiedAt))));
      row.title='Źródło: '+event.sourceUrl+'; weryfikacja: '+verifiedFormat.format(Date.parse(event.verifiedAt));
      row.append(date,info,el('span','calendar-impact '+({confirmed:'medium',expected:'low',speculative:'low'}[event.confidence]),M.CONFIDENCE[event.confidence]));container.append(row);
    }
    if(note){
      const verified=Object.values(datasets.auto?.sources||{}).map(s=>M.timestamp(s.verifiedAt)).filter(t=>t!==null);
      note.replaceChildren(el('span','',(unhealthy?'nieświeże dane / błąd aktualizacji':'automat + wpisy ręczne')+' · czas: Warszawa'+(verified.length?' · weryfikacja '+verifiedFormat.format(Math.max(...verified)):'')));
      const licenses=el('a','crypto-event-link','źródła i licencje');licenses.href='./data/crypto-licenses/NOTICE.txt';note.append(el('span','',' · '),licenses);
    }
  }
  async function update(){
    if(busy)return;busy=true;container.setAttribute('aria-busy','true');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      await Promise.all(['auto','manual'].map(async origin=>{
        try{
          const response=await fetch('./data/crypto-'+origin+'.json',{signal:controller.signal,cache:'no-store'});
          if(!response.ok)throw new Error('HTTP '+response.status);
          const result=M.parseDataset(await response.json(),origin,Date.now());
          if(origin==='auto'&&datasets.auto&&result.generatedAt<datasets.auto.generatedAt)throw new Error('Starsza wersja automatu');
          datasets[origin]=result;failed[origin]=false;
        }catch(error){failed[origin]=true;console.warn('Aktualizacja kalendarza krypto ('+origin+') nie powiodła się:',error);}
      }));
      show();
    }finally{clearTimeout(timer);busy=false;container.setAttribute('aria-busy','false');}
  }
  update();setInterval(update,60000);
})();
