'use strict';
const path=require('node:path');
const {runPilot}=require('./crypto-calendar/xlm-pilot.cjs');
function args(argv){const result={};for(let i=0;i<argv.length;i++){const flag=argv[i];if(!['--mode','--artifacts','--state','--scratch','--start-at'].includes(flag)||!argv[i+1])throw Error('Invalid pilot argument');result[flag.slice(2)]=argv[++i];}return result;}
async function main(){
 const options=args(process.argv.slice(2)),base=path.resolve(__dirname,'../docs/crypto-calendar-xlm/pilot/.cache');
 const receipt=await runPilot({mode:options.mode||process.env.XLM_PILOT_MODE||'probe',enabled:process.env.XLM_PILOT_ENABLED==='true',startAt:options['start-at']||process.env.XLM_PILOT_START_AT,
  artifactDir:options.artifacts||path.join(base,'artifacts'),stateDir:options.state||path.join(base,'state'),scratchDir:options.scratch||path.join(base,'scratch')});
 console.log(JSON.stringify(receipt));
 if(process.env.GITHUB_STEP_SUMMARY){const fs=require('node:fs/promises');await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,'## XLM technical pilot\n\n'+
  '- Result: '+receipt.status+'\n- Fresh HTTP 200: '+String(receipt.coldHttp200Passed||false)+'\n- Public event records: 0\n- Publication approved: false\n');}
 if(receipt.status==='failure')process.exitCode=1;
}
if(require.main===module)main().catch(()=>{console.error('Pilot verification failed. No raw source content is logged.');process.exitCode=1;});
module.exports={args};
