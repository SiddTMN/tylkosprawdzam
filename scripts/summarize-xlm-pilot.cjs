'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {summary,validateState}=require('./crypto-calendar/xlm-pilot.cjs');
async function findHistories(dir){const result=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())result.push(...await findHistories(file));else if(entry.name==='history.redacted.json')result.push(file);}return result;}
function combine(states){
 if(!states.length)throw Error('No pilot histories');const startAt=states[0].startAt;
 for(const state of states)validateState(state,startAt);
 const baselines=states.map(s=>s.baselineAt).filter(Boolean).sort(),baselineAt=baselines[0]||null;
 const out={...states[0],entities:{},samples:[],baselineAt};const samples=new Map();
 for(const state of states){for(const s of state.samples){const prior=samples.get(s.checkedAt);if(prior&&JSON.stringify(prior)!==JSON.stringify(s))throw Error('Conflicting samples at same capture time');samples.set(s.checkedAt,s);}
  for(const [key,e] of Object.entries(state.entities)){const prior=out.entities[key];if(!prior)out.entities[key]={...e};else {prior.firstSeenAt=[prior.firstSeenAt,e.firstSeenAt].sort()[0];if(e.lastSeenAt>prior.lastSeenAt){prior.lastSeenAt=e.lastSeenAt;prior.fingerprint=e.fingerprint;}prior.revisions=Math.max(prior.revisions,e.revisions);}}
 }
 out.samples=[...samples.values()].sort((a,b)=>a.checkedAt.localeCompare(b.checkedAt));
 for(const e of Object.values(out.entities))e.baseline=e.firstSeenAt===baselineAt;
 return {...summary(out),historiesInspected:states.length,baselineSegments:baselines.filter((v,i,a)=>a.indexOf(v)===i).length,dateOrStatusRevisions:out.samples.reduce((n,s)=>n+(s.dateOrStatusRevisions||0),0)};
}
async function main(){const file=process.argv[2];if(!file)throw Error('Usage: node scripts/summarize-xlm-pilot.cjs HISTORY.json | ARTIFACTS_DIRECTORY');const files=(await fs.stat(file)).isDirectory()?await findHistories(file):[file];const states=await Promise.all(files.map(async f=>JSON.parse(await fs.readFile(f,'utf8'))));console.log(JSON.stringify(combine(states),null,2));}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={combine,findHistories};
