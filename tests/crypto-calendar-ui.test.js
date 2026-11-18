'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const M=require('../js/crypto-calendar-model.js');
const modelSource=fs.readFileSync(path.join(__dirname,'../js/crypto-calendar-model.js'),'utf8');
const source=fs.readFileSync(path.join(__dirname,'../js/crypto-calendar.js'),'utf8');
class Element {
    constructor(tag) {
        this.tagName = tag;
        this.className = "";
        this.children = [];
        this.attributes = new Map();
        this.text = "";
    }
    set innerHTML(_) { throw new Error("Unsafe HTML rendering"); }
    set textContent(value) { this.text = String(value); this.children = []; }
    get textContent() { return this.text + this.children.map(child => child.textContent).join(""); }
    set title(value) { this.setAttribute("title", value); }
    get title() { return this.attributes.get("title") || ""; }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    removeAttribute(key) { this.attributes.delete(key); }
    appendChild(child) {
        if (child.tagName === "#fragment") {
            this.children.push(...child.children);
            child.children = [];
        } else this.children.push(child);
        return child;
    }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    replaceChildren(...children) { this.children = []; this.text = ""; this.append(...children); }
}


const verified='2026-10-11T12:00:00.000Z';
function fixture(token='ETH',at='2026-10-15T14:00:00.000Z'){
 return {id:token+':'+at,assets:[token],period:{precision:'day',date:M.day(Date.parse(at))},startsAt:at,title:'Fixture only',description:'Fixture only description',confidence:'confirmed',status:'planned',origin:'manual',sourceUrl:'https://example.org/event',verifiedAt:verified};
}
const snapshot=(events=[])=>({schemaVersion:2,origin:'manual',events});
function harness(initial,options={}){
 let now=Date.parse(options.now||verified),payload=initial;const container=new Element('div'),note=new Element('p'),intervals=[],timers=new Map(),requests=[],warnings=[];let tid=0;
 class Clock extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}}
 const context=vm.createContext({Date:Clock,Intl,URL,AbortController,document:{getElementById:id=>id==='crypto-calendar-events'?options.missing?null:container:id==='crypto-calendar-status'?note:null,createElement:tag=>new Element(tag)},fetch:async(url,request)=>{requests.push({url,...request});assert.equal(url,'./data/crypto-manual.json');if(payload instanceof Error)throw payload;const data=typeof payload==='function'?await payload(request):payload;return {ok:options.httpStatus===undefined||options.httpStatus===200,status:options.httpStatus||200,json:async()=>structuredClone(data)};},console:{warn:(...a)=>warnings.push(a)},setInterval:(callback,ms)=>{intervals.push({callback,ms});},setTimeout:(callback,ms)=>{timers.set(++tid,{callback,ms});return tid;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(modelSource,context);vm.runInContext(source,context);const flush=()=>new Promise(r=>setImmediate(r));
 return {container,note,requests,warnings,intervals,timers,flush,setPayload:p=>{payload=p;},setNow:n=>{now=Date.parse(n);},refresh:async()=>{await intervals[0].callback();await flush();}};
}

test('manual frontend preserves row layout, source links, Warsaw DST and fetches only manual JSON',async()=>{
 const h=harness(snapshot([fixture(),fixture('ETH','2026-10-29T14:00:00.000Z')]));await h.flush();assert.equal(h.container.children.length,2);
 assert.equal(h.container.children[0].className,'calendar-event');assert.equal(h.container.children[0].children[0].children[1].textContent,'16:00');assert.equal(h.container.children[1].children[0].children[1].textContent,'15:00');
 const link=h.container.children[0].children[1].children[0].children[0];assert.equal(link.href,'https://example.org/event');assert.equal(link.rel,'noopener noreferrer');
 assert.equal(h.note.textContent,'wpisy ręczne · czas: Warszawa');assert.equal(h.requests.length,1);assert.equal(h.requests[0].cache,'no-store');assert.equal(h.timers.size,0);
});

test('empty manual file is healthy and distinct from an unreadable file',async()=>{
 const h=harness(snapshot());await h.flush();assert.equal(h.container.textContent,'brak zaplanowanych wydarzeń krypto');assert.equal(h.container.getAttribute('data-stale'),'false');
 assert.doesNotMatch(h.note.textContent,/automat|błąd|licencje|nieświeże/);
 h.setPayload(new Error('offline'));await h.refresh();assert.match(h.container.textContent,/niedostępny/);assert.match(h.note.textContent,/błąd odczytu/);
 h.setPayload(snapshot());await h.refresh();assert.equal(h.container.textContent,'brak zaplanowanych wydarzeń krypto');assert.equal(h.container.getAttribute('data-stale'),'false');
});

test('failed refresh retains future manual rows, expires past rows, and recovery clears errors',async()=>{
 const h=harness(snapshot([fixture()]));await h.flush();h.setPayload(new Error('offline'));await h.refresh();assert.equal(h.container.children.length,1);assert.equal(h.container.getAttribute('data-stale'),'true');assert.match(h.container.textContent,/nie udało się odświeżyć/);
 h.setPayload(snapshot([fixture()]));await h.refresh();assert.equal(h.container.getAttribute('data-stale'),'false');assert.doesNotMatch(h.container.textContent,/nie udało się/);
 h.setPayload(new Error('offline'));h.setNow('2026-10-15T14:01:00Z');await h.refresh();assert.match(h.container.textContent,/niedostępny/);assert.doesNotMatch(h.container.textContent,/Fixture only/);
});

test('network, HTTP, JSON, schema and unsafe source errors never create synthetic rows',async()=>{
 for(const payload of [new Error('offline'),{},snapshot([{...fixture(),sourceUrl:'javascript:alert(1)'}]),{schemaVersion:2,origin:'auto',events:[]},()=>{throw new SyntaxError('Invalid JSON');}]){
  const h=harness(payload);await h.flush();assert.match(h.container.textContent,/niedostępny/);assert.equal(h.warnings.length,1);assert.equal(h.container.getAttribute('aria-busy'),'false');
 }
 const h=harness(snapshot(),{httpStatus:404});await h.flush();assert.match(h.container.textContent,/niedostępny/);
});

test('manual entries do not expire based on verification age',async()=>{
 const h=harness(snapshot([fixture()]),{now:'2026-10-14T12:00:00Z'});await h.flush();assert.equal(h.container.getAttribute('data-stale'),'false');assert.doesNotMatch(h.note.textContent,/nieświeże|automat/);
});

test('supported assets and source text render safely as literal text',async()=>{
 const e={...fixture('BONK'),title:'<img src=x onerror=alert(1)>',description:'<script>fixture</script>'};const h=harness(snapshot([e]));await h.flush();assert.match(h.container.textContent,/BONK \(Bonk\) — <img/);assert.match(h.container.textContent,/<script>fixture/);assert.equal(h.warnings.length,0);
});

test('refresh is single-flight and timeout releases busy state and permits recovery',async()=>{
 const h=harness(request=>new Promise((resolve,reject)=>request.signal.addEventListener('abort',()=>reject(new Error('timeout')),{once:true})));await h.flush();const pending=h.refresh();assert.equal(h.requests.length,1);[...h.timers.values()][0].callback();await pending;await h.flush();assert.match(h.container.textContent,/niedostępny/);assert.equal(h.container.getAttribute('aria-busy'),'false');assert.equal(h.timers.size,0);
 h.setPayload(snapshot([fixture()]));await h.refresh();assert.equal(h.container.children.length,1);assert.equal(h.container.getAttribute('data-stale'),'false');
});

test('missing crypto container does not make requests or start timers',async()=>{
 const h=harness(snapshot(),{missing:true});await h.flush();assert.equal(h.requests.length,0);assert.equal(h.intervals.length,0);
});

test('index has one model and renderer, manual status and retains macro scripts',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');assert.equal((html.match(/src="js\/crypto-calendar.js"/g)||[]).length,1);assert.ok(html.indexOf('src="js/crypto-calendar-model.js"')<html.indexOf('src="js/crypto-calendar.js"'));assert.equal((html.match(/src="js\/calendar.js"/g)||[]).length,1);assert.match(html,/wpisy ręczne · czas: Warszawa/);assert.doesNotMatch(html,/automat \+ wpisy ręczne/);
});

test('manual month/week/range, multiple assets, cancellation and certainty render without a guessed time',async()=>{
 const e={...fixture('ATH'),assets:['ATH','BONK'],period:{precision:'month',month:'2026-10'},startsAt:null,confidence:'speculative',status:'cancelled'};
 const h=harness(snapshot([e]));await h.flush();assert.match(h.container.textContent,/październik 2026/);assert.match(h.container.textContent,/Aethir/);assert.match(h.container.textContent,/spekulacyjne/);assert.match(h.container.textContent,/odwołane/);assert.match(h.container.textContent,/wpis ręczny/);assert.equal(h.container.children[0].children[0].children[1].textContent,'—');
 h.setPayload(snapshot([{...e,period:{precision:'week',from:'2026-10-12',to:'2026-10-18'},status:'postponed'}]));await h.refresh();assert.match(h.container.textContent,/tydz\. 12.*18/);assert.match(h.container.textContent,/przesunięte/);
 h.setPayload(snapshot([{...e,period:{precision:'range',from:'2026-10-28',to:'2026-10-29'}}]));await h.refresh();assert.match(h.container.children[0].children[0].textContent,/28.*29/);
});

test('manual selection sorts dates and times before limiting, deduplicates facts and hides completed/out-of-window rows',async()=>{
 const es=Array.from({length:7},(_,i)=>({...fixture('ETH','2026-10-15T'+(19-i)+':00:00.000Z'),id:'item-'+i,title:'Event '+i}));
 const duplicate={...es[6],id:'latest-copy',verifiedAt:'2026-10-11T12:00:01.000Z'};
 const expired=fixture('BTC','2026-10-10T12:00:00.000Z'),completed={...es[0],id:'completed',status:'completed'},far=fixture('BTC','2026-12-01T12:00:00.000Z');
 const h=harness(snapshot([...es,duplicate,expired,completed,far]));await h.flush();assert.equal(h.container.children.length,5);
 assert.deepEqual(h.container.children.map(row=>row.children[1].children[0].textContent),[6,5,4,3,2].map(i=>'ETH (Ethereum) — Event '+i));
 h.setNow('2026-10-15T13:01:00Z');await h.refresh();assert.equal(h.container.children.length,5);assert.match(h.container.children[0].textContent,/Event 5/);
 h.setPayload(snapshot());await h.refresh();assert.equal(h.container.textContent,'brak zaplanowanych wydarzeń krypto');
});
test('manual ordering compares actual instants with optional fractional seconds',async()=>{
 const first={...fixture('ETH','2026-10-15T14:00:00Z'),title:'first'};
 const second={...fixture('ETH','2026-10-15T14:00:00.001Z'),title:'second'};
 const h=harness(snapshot([second,first]));await h.flush();
 assert.match(h.container.children[0].textContent,/first/);assert.match(h.container.children[1].textContent,/second/);
});
test('user November entries retain Warsaw times, importance and an untimed ATH deadline without fabricated links',async()=>{
 const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/crypto-manual.json'),'utf8'));
 const h=harness(data,{now:'2026-11-18T23:00:00Z'});await h.flush();
 assert.equal(h.container.children.length,4);assert.equal(h.warnings.length,0);
 assert.deepEqual(h.container.children.map(row=>row.children[0].children[1].textContent),['22:00','18:00','09:00','—']);
 assert.deepEqual(h.container.children.map(row=>row.children[2].textContent),['Średnie','Wysokie','Wysokie','Wysokie']);
 assert.match(h.container.children[3].children[0].children[0].textContent,/^do 30/);
 for(const row of h.container.children){assert.equal(row.children[1].children[0].children[0].tagName,'span');assert.match(row.title,/Wpis ręczny; aktualizacja:/);}
 h.setNow('2026-11-30T22:59:59Z');await h.refresh();assert.equal(h.container.children.length,1);assert.match(h.container.textContent,/spalania ATH/);
 h.setNow('2026-11-30T23:00:00Z');await h.refresh();assert.equal(h.container.textContent,'brak zaplanowanych wydarzeń krypto');
});
