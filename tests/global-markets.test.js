'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../js/global-markets.js'),'utf8');

function setup(online=true){
 const listeners={},timers=new Map();let timerId=0,retry;
 class Element{
  constructor(){this.children=[];this.hidden=false;this.textContent='';}
  append(...children){for(const child of children){child.parentNode=this;this.children.push(child);}}
  replaceChildren(){for(const child of this.children)child.parentNode=null;this.children=[];}
  querySelector(selector){return this.children.find(child=>selector==='iframe'&&child.contentWindow)||null;}
 }
 const rows=['OANDA:XAUUSD','FOREXCOM:SPXUSD','FOREXCOM:NSXUSD'].map(symbol=>{
  const host=new Element(),status=new Element();
  return {host,status,dataset:{marketSymbol:symbol},querySelector:s=>s==='.global-quote-widget'?host:status};
 });
 const panel={querySelectorAll:()=>rows,querySelector:()=>({addEventListener:(name,fn)=>{retry=fn;}})};
 const navigator={onLine:online};
 vm.runInNewContext(source,{
  document:{querySelector:()=>panel,createElement:()=>new Element()},navigator,
  window:{addEventListener:(name,fn)=>{listeners[name]=fn;}},
  setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)
 });
 const frame=row=>{const result={contentWindow:{}};row.host.append(result);return result;};
 const message=(frame,name,origin='https://www.tradingview-widget.com')=>listeners.message({source:frame.contentWindow,origin,data:{name}});
 return {rows,listeners,timers,navigator,frame,message,retry:()=>retry(),expire:()=>{for(const [id,fn]of [...timers]){timers.delete(id);fn();}}};
}

test('official widgets use the approved symbols and stay hidden until matching-origin readiness',()=>{
 const h=setup(),row=h.rows[0],frame=h.frame(row),script=row.host.children[0].children[1];
 assert.equal(script.src,'https://s3.tradingview.com/external-embedding/embed-widget-single-quote.js');
 assert.equal(JSON.parse(script.textContent).symbol,'OANDA:XAUUSD');
 h.rows.forEach(r=>assert.equal(r.host.hidden,true));
 h.message(frame,'tv-widget-ready','https://untrusted.example');assert.equal(row.host.hidden,true);
 h.message({contentWindow:{}},'tv-widget-ready');assert.equal(row.host.hidden,true);
 h.message(frame,'tv-widget-load');assert.equal(row.host.hidden,true);
 h.message(frame,'tv-widget-ready');assert.equal(row.host.hidden,false);
 assert.match(row.status.textContent,/Ostatnie dostępne/);
 assert.equal(h.rows[1].host.hidden,true);
 assert.deepEqual(h.rows.map(r=>JSON.parse(r.host.children[0].children[1].textContent).symbol),['OANDA:XAUUSD','FOREXCOM:SPXUSD','FOREXCOM:NSXUSD']);
});

test('timeout, provider no-data and script failure hide quotes independently; retry recovers',()=>{
 const h=setup(),frame=h.frame(h.rows[0]);h.message(frame,'tv-widget-ready');h.expire();
 assert.equal(h.rows[0].host.hidden,false);
 assert.match(h.rows[1].status.textContent,/Nie udało się/);
 const late=h.frame(h.rows[1]);h.message(late,'tv-widget-ready');assert.equal(h.rows[1].host.hidden,true);
 h.message(frame,'tv-widget-no-data');assert.equal(h.rows[0].host.hidden,true);
 assert.match(h.rows[0].status.textContent,/niedostępne u dostawcy/);
 h.retry();
 const script=h.rows[2].host.children[0].children[1];script.onerror();
 assert.match(script.src,/\?reload=2$/);
 assert.match(h.rows[2].status.textContent,/zablokowany/);
 const fresh=h.frame(h.rows[0]);h.message(fresh,'tv-widget-ready');assert.equal(h.rows[0].host.hidden,false);
 assert.equal(h.rows[2].host.hidden,true);
});

test('offline immediately hides all prices, online recreates frames, and old callbacks cannot revive them',()=>{
 const h=setup(),row=h.rows[0],frame=h.frame(row),oldScript=row.host.children[0].children[1];
 h.message(frame,'tv-widget-ready');
 h.navigator.onLine=false;h.listeners.offline();
 h.rows.forEach(r=>{assert.equal(r.host.hidden,true);assert.match(r.status.textContent,/Brak połączenia/);});
 h.message(frame,'tv-widget-ready');assert.equal(row.host.hidden,true);
 h.navigator.onLine=true;h.listeners.online();oldScript.onerror();
 assert.match(row.status.textContent,/Pobieranie/);
 h.message(frame,'tv-widget-ready');assert.equal(row.host.hidden,true);
 h.message(h.frame(row),'tv-widget-ready');assert.equal(row.host.hidden,false);
});

test('starting offline never loads third-party scripts',()=>{
 const h=setup(false);
 h.rows.forEach(r=>{assert.equal(r.host.children.length,0);assert.equal(r.host.hidden,true);assert.match(r.status.textContent,/Brak połączenia/);});
 assert.equal(h.timers.size,0);
});
