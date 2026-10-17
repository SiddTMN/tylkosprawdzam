'use strict';
// Executes the actual panel scripts against HTTP data in a minimal DOM.
// This verifies rendered content, not browser layout or a screenshot.
const fs=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..'),DIR=path.join(ROOT,'docs/crypto-calendar-xlm/stage2');
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.attributes=new Map();this.text='';this.className='';}
 set innerHTML(_){throw Error('Unsafe panel HTML');}
 set textContent(value){this.text=String(value);this.children=[];}
 get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}
 set title(value){this.attributes.set('title',value);}get title(){return this.attributes.get('title')||'';}
 setAttribute(key,value){this.attributes.set(key,String(value));this.onAttribute?.(key,String(value));}
 getAttribute(key){return this.attributes.get(key)??null;}removeAttribute(key){this.attributes.delete(key);}
 appendChild(child){if(child.tagName==='#fragment')this.children.push(...child.children);else this.children.push(child);return child;}
 append(...children){children.forEach(c=>this.appendChild(c));}
 replaceChildren(...children){this.children=[];this.text='';this.append(...children);}
}
async function verify({url='http://127.0.0.1:4174/',fetchImpl=fetch}={}){
 const base=new URL(url);if(base.hostname!=='127.0.0.1')throw Error('Local preview only');
 const nodes=new Map(['calendar-events','crypto-calendar-events','crypto-calendar-status'].map(id=>[id,new Element('div')]));
 const requests=[],warnings=[],intervals=[];let cryptoDone,macroDone;
 const done=[new Promise(r=>cryptoDone=r),new Promise(r=>macroDone=r)];
 nodes.get('crypto-calendar-events').onAttribute=(k,v)=>{if(k==='aria-busy'&&v==='false')cryptoDone();};
 nodes.get('calendar-events').onAttribute=(k,v)=>{if(k==='aria-busy'&&v==='false')macroDone();};
 const document={getElementById:id=>nodes.get(id)||null,createElement:tag=>new Element(tag),createDocumentFragment:()=>new Element('#fragment')};
 const ctx=vm.createContext({document,Intl,Date,URL,AbortController,setTimeout,clearTimeout,setInterval:(fn,ms)=>intervals.push({fn,ms}),console:{warn:(...args)=>warnings.push(args.map(String).join(' '))},
  fetch:async(request,options)=>{const target=new URL(request,base);if(target.origin!==base.origin&&!(target.hostname==='www.financecalendar.com'&&target.pathname==='/wp-json/fc/v1/calendar'))throw Error('Unexpected panel endpoint');requests.push(target.href);return fetchImpl(target,options);}});
 for(const file of ['js/treasury-model.js','js/calendar-model.js','js/crypto-calendar-model.js','js/calendar.js','js/crypto-calendar.js']){
  const response=await fetchImpl(new URL(file,base));assert.equal(response.status,200);vm.runInContext(await response.text(),ctx,{filename:file});
 }
 let timeout;try{await Promise.race([Promise.all(done),new Promise((_,reject)=>timeout=setTimeout(()=>reject(Error('Panel rendering timed out')),35000))]);}finally{clearTimeout(timeout);}
 const snapshot=await (await fetchImpl(new URL('data/crypto-calendar.json',base))).json();
 const model=require('../js/crypto-calendar-model.js');model.parseSnapshot(snapshot,Date.now());
 const cryptoRows=nodes.get('crypto-calendar-events').children.filter(c=>c.className==='calendar-event');
 assert.equal(cryptoRows.length,5);assert.deepEqual(cryptoRows.map(r=>r.children[1].children[0].children[0].textContent),snapshot.events.map(e=>e.token+' — '+e.title));
 const meridian=cryptoRows.find(r=>r.textContent.includes('Meridian 2026'));assert.match(meridian.children[0].textContent,/28.*29/);assert.equal(meridian.children[0].children[1].textContent,'—');
 const macroRows=nodes.get('calendar-events').children.filter(c=>c.className==='calendar-event');assert.ok(macroRows.length>0&&macroRows.length<=5,'Macro calendar must render real rows');
 const servedMacro=await (await fetchImpl(new URL('data/macro-calendar.json',base))).text();assert.equal(servedMacro,await fs.readFile(path.join(ROOT,'data/macro-calendar.json'),'utf8'));
 const result={checkedAt:new Date().toISOString(),url,method:'Actual JavaScript panel scripts in minimal DOM with HTTP data; no browser/layout verification.',passed:true,
  cryptoRows:cryptoRows.map(r=>({date:r.children[0].children[0].textContent,time:r.children[0].children[1].textContent,title:r.children[1].children[0].children[0].textContent,priority:r.children[2].textContent,stale:r.getAttribute('data-stale')})),
  cryptoStatus:nodes.get('crypto-calendar-status').textContent,macroRows:macroRows.map(r=>r.textContent),macroStale:nodes.get('calendar-events').getAttribute('data-stale'),macroFileServedUnchanged:true,requests,warnings};
 await fs.writeFile(path.join(DIR,'preview-verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));return result;
}
if(require.main===module)verify().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={verify};
