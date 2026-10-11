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
function fixture(token='ETH',at='2026-10-15T14:00:00.000Z',sourceId='test-source'){
 return {id:sourceId+':'+at,token,date:M.day(Date.parse(at)),startsAt:at,title:'Fixture only',description:'Fixture only description',category:'protocol-meeting',priority:'medium',sourceId,sourceUrl:'https://example.org/event',verifiedAt:verified};
}
function snapshot(events=[fixture()],status='fresh'){
 return {schemaVersion:1,mode:'local-prototype',generatedAt:verified,displayTimezone:M.TIME_ZONE,window:M.windowAt(Date.parse(verified)),events,sources:{'test-source':{name:'Fixture source',url:'https://example.org/feed',status,verifiedAt:status==='unavailable'?null:verified,checkedAt:verified}}};
}
function harness(initial,options={}){
 let now=Date.parse(options.now||verified),payload=initial;const container=new Element('div'),note=new Element('p'),intervals=[],timers=new Map(),requests=[],warnings=[];let tid=0;
 class Clock extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}}
 const context=vm.createContext({Date:Clock,Intl,URL,AbortController,document:{getElementById:id=>id==='crypto-calendar-events'?options.missing?null:container:id==='crypto-calendar-status'?note:null,createElement:tag=>new Element(tag)},fetch:async(url,request)=>{requests.push({url,...request});if(payload instanceof Error)throw payload;const data=typeof payload==='function'?await payload(request):payload;return {ok:true,json:async()=>structuredClone(data)};},console:{warn:(...a)=>warnings.push(a)},setInterval:(callback,ms)=>{intervals.push({callback,ms});},setTimeout:(callback,ms)=>{timers.set(++tid,{callback,ms});return tid;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(modelSource,context);vm.runInContext(source,context);const flush=()=>new Promise(r=>setImmediate(r));
 return {container,note,requests,warnings,intervals,timers,flush,setPayload:p=>{payload=p;},setNow:n=>{now=Date.parse(n);},refresh:async()=>{await intervals[0].callback();await flush();}};
}
test('frontend renders fewer than five real rows, source links, factual descriptions and Warsaw DST',async()=>{
 const h=harness(snapshot([fixture(),fixture('ETH','2026-10-29T14:00:00.000Z')]));await h.flush();assert.equal(h.container.children.length,2);
 assert.equal(h.container.children[0].className,'calendar-event');assert.equal(h.container.children[0].children[0].children[1].textContent,'16:00');assert.equal(h.container.children[1].children[0].children[1].textContent,'15:00');
 const link=h.container.children[0].children[1].children[0].children[0];assert.equal(link.href,'https://example.org/event');assert.equal(link.rel,'noopener noreferrer');assert.match(h.note.textContent,/weryfikacja/);assert.equal(h.requests[0].url,'./data/crypto-calendar.json');assert.equal(h.requests[0].cache,'no-store');assert.equal(h.timers.size,0);
});
test('healthy empty response is distinct from unavailable/stale empty response',async()=>{
 const empty=harness(snapshot([]));await empty.flush();assert.match(empty.container.textContent,/brak nadchodzących/);
 for(const status of ['stale','unavailable']){const h=harness(snapshot([],status));await h.flush();assert.match(h.container.textContent,/niedostępny/);assert.doesNotMatch(h.container.textContent,/brak nadchodzących/);}
});
test('JSON network failure retains only future rows with visible original verification, and recovery clears stale marks',async()=>{
 const h=harness(snapshot([fixture()]));await h.flush();h.setPayload(new Error('offline'));await h.refresh();assert.equal(h.container.children.length,1);assert.equal(h.container.getAttribute('data-stale'),'true');assert.match(h.container.textContent,/nieświeże dane.*11.10.2026/);
 h.setPayload(snapshot([fixture()]));await h.refresh();assert.equal(h.container.getAttribute('data-stale'),'false');assert.doesNotMatch(h.container.textContent,/nieświeże/);
 h.setPayload(new Error('offline'));h.setNow('2026-10-15T14:01:00Z');await h.refresh();assert.match(h.container.textContent,/niedostępny/);assert.doesNotMatch(h.container.textContent,/Fixture only/);
});
test('initial failure, malformed data and expired snapshot show an error, never synthetic events',async()=>{
 for(const payload of [new Error('offline'),{},snapshot([{...fixture(),sourceUrl:'javascript:alert(1)'}])]){const h=harness(payload);await h.flush();assert.match(h.container.textContent,/błąd pobierania/);assert.equal(h.warnings.length,1);}
 const expired=harness(snapshot(),{now:'2026-11-10T12:00:00Z'});await expired.flush();assert.match(expired.container.textContent,/błąd pobierania/);
});
test('new token rows require no renderer changes and source text is rendered safely',async()=>{
 const e={...fixture('BONK'),title:'<img src=x onerror=alert(1)>',description:'<script>fixture</script>'};const h=harness(snapshot([e]));await h.flush();assert.match(h.container.textContent,/BONK — <img/);assert.match(h.container.textContent,/<script>fixture/);assert.equal(h.warnings.length,0);
});
test('staleness is recalculated against source verification even when JSON fetch succeeds',async()=>{
 const h=harness(snapshot(),{now:'2026-10-11T19:00:00Z'});await h.flush();assert.equal(h.container.getAttribute('data-stale'),'true');assert.match(h.container.textContent,/nieświeże dane/);
});
test('refresh is single-flight and timeout releases busy state',async()=>{
 const h=harness(request=>new Promise((resolve,reject)=>request.signal.addEventListener('abort',()=>reject(new Error('timeout')),{once:true})));await h.flush();const pending=h.refresh();assert.equal(h.requests.length,1);[...h.timers.values()][0].callback();await pending;await h.flush();assert.match(h.container.textContent,/błąd pobierania/);assert.equal(h.container.getAttribute('aria-busy'),'false');assert.equal(h.timers.size,0);
});
test('missing crypto container does not make requests or start timers',async()=>{
 const h=harness(snapshot(),{missing:true});await h.flush();assert.equal(h.requests.length,0);assert.equal(h.intervals.length,0);
});
test('index has one model and renderer, no static test events, and retains macro scripts',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');assert.equal((html.match(/src="js\/crypto-calendar.js"/g)||[]).length,1);assert.ok(html.indexOf('src="js/crypto-calendar-model.js"')<html.indexOf('src="js/crypto-calendar.js"'));assert.equal((html.match(/src="js\/calendar.js"/g)||[]).length,1);assert.doesNotMatch(html,/Ethereum · test|Polkadot · test|Aethir · test|BONK — test/);
});

test('production calendar keeps the existing layout and identifies automatic factual updates',async()=>{
 const data=snapshot();data.mode='automated-calendar';data.publication={approved:true,scope:'project-publication-only',licenseConfirmed:false};
 const h=harness(data);await h.flush();
 assert.equal(h.container.children.length,1);assert.equal(h.container.children[0].className,'calendar-event');
 assert.match(h.note.textContent,/kalendarz aktualizowany automatycznie/);
 assert.doesNotMatch(h.note.textContent,/wersja lokalna/);
});
