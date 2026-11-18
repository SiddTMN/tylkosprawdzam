(()=>{
  'use strict';
  const container=document.getElementById('crypto-calendar-events');
  if(!container)return;
  const note=document.getElementById('crypto-calendar-status'),M=CryptoCalendarModel;
  const timeFormat=new Intl.DateTimeFormat('pl-PL',{timeZone:M.TIME_ZONE,hour:'2-digit',minute:'2-digit'});
  const verifiedFormat=new Intl.DateTimeFormat('pl-PL',{timeZone:M.TIME_ZONE,dateStyle:'short',timeStyle:'short'});
  let dataset=null,failed=false,busy=false;
  function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
  function show(){
    const events=dataset?M.upcomingManual(dataset,Date.now()):[];
    const unhealthy=failed||!dataset;
    container.replaceChildren();container.setAttribute('data-stale',String(unhealthy));
    if(!events.length)container.append(el('div','calendar-loading',unhealthy?'kalendarz krypto niedostępny — nie udało się wczytać wpisów ręcznych':'brak zaplanowanych wydarzeń krypto'));
    for(const event of events){
      const stale=unhealthy;
      const row=el('div','calendar-event');row.setAttribute('data-origin',event.origin);row.setAttribute('data-stale',String(stale));
      const date=el('div','calendar-date'),clock=el('strong','',event.startsAt?timeFormat.format(Date.parse(event.startsAt)):'—');
      if(!event.startsAt){clock.title='Godzina nie została podana; okres orientacyjny nie oznacza dokładnej daty.';clock.setAttribute('aria-label','bez potwierdzonej godziny');}
      date.append(el('span','',M.periodLabel(event.period)),clock);
      const info=el('div','calendar-info'),title=el('strong','');
      const assetLabel=event.assets.map(a=>a+' ('+M.ASSETS[a]+')').join(', ');
      const label=el(event.sourceUrl?'a':'span',event.sourceUrl?'crypto-event-link':'',assetLabel+' — '+event.title);
      if(event.sourceUrl){label.href=event.sourceUrl;label.target='_blank';label.rel='noopener noreferrer';}
      title.append(label);
      info.append(title,el('span','',event.description));
      if(['postponed','cancelled'].includes(event.status))info.append(el('span','crypto-event-status',M.STATUS[event.status]));
      info.append(el('span','','wpis ręczny'));
      if(stale)info.append(el('span','crypto-stale-note','nie udało się odświeżyć wpisów ręcznych'));
      row.title=(event.sourceUrl?'Źródło: '+event.sourceUrl+'; weryfikacja: ':'Wpis ręczny; aktualizacja: ')+verifiedFormat.format(Date.parse(event.verifiedAt));
      const impact=event.impact||({confirmed:'medium',expected:'low',speculative:'low'}[event.confidence]);
      row.append(date,info,el('span','calendar-impact '+impact,event.impact?M.IMPACT[event.impact]:M.CONFIDENCE[event.confidence]));container.append(row);
    }
    if(note){
      note.textContent=(unhealthy?'błąd odczytu wpisów ręcznych':'wpisy ręczne')+' · czas: Warszawa';
    }
  }
  async function update(){
    if(busy)return;busy=true;container.setAttribute('aria-busy','true');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      try{
        const response=await fetch('./data/crypto-manual.json',{signal:controller.signal,cache:'no-store'});
        if(!response.ok)throw new Error('HTTP '+response.status);
        dataset=M.parseDataset(await response.json(),'manual',Date.now());failed=false;
      }catch(error){failed=true;console.warn('Odczyt wpisów ręcznych kalendarza krypto nie powiódł się:',error);}
      show();
    }finally{clearTimeout(timer);busy=false;container.setAttribute('aria-busy','false');}
  }
  update();setInterval(update,60000);
})();
