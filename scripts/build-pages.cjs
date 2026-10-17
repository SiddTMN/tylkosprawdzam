'use strict';
// The production artifact is an allowlist, never a recursive repository copy.
const fs=require('node:fs/promises'),path=require('node:path');
const {constants}=require('node:fs');
const {validateFile}=require('./update-crypto-calendar.cjs');
const macro=require('../js/calendar-model.js');
const ROOT=path.resolve(__dirname,'..');
const PUBLIC_FILES=Object.freeze([
 'index.html','css/style.css',
 'js/app.js','js/treasury-model.js','js/calendar-model.js','js/calendar.js',
 'js/crypto-calendar-model.js','js/crypto-calendar.js','js/news.js','js/snapshot.js','js/dxy.js',
 'data/macro-calendar.json','data/crypto-auto.json','data/crypto-manual.json',
 'data/crypto-licenses/NOTICE.txt','data/crypto-licenses/eth-pm-license.txt',
 'data/crypto-licenses/eth-eips-license.txt','data/crypto-licenses/xlm-docs-license.txt'
]);
async function verifyPagesSource({env=process.env,fetchImpl=fetch}={}){
 if(!env.GH_TOKEN||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY||''))throw new Error('Pages source check requires GitHub token and repository');
 const response=await fetchImpl(`${env.GITHUB_API_URL||'https://api.github.com'}/repos/${env.GITHUB_REPOSITORY}/pages`,{
  headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${env.GH_TOKEN}`,'X-GitHub-Api-Version':'2022-11-28'},
  signal:AbortSignal.timeout(15000),redirect:'error'
 });
 if(!response.ok)throw new Error(`Cannot verify Pages source (HTTP ${response.status}); publication blocked`);
 const config=await response.json();
 if(config?.build_type!=='workflow')throw new Error('Publication blocked: Settings > Pages > Build and deployment > Source must be GitHub Actions; legacy branch/Jekyll publication is not protected by this artifact');
 return {build_type:config.build_type};
}
async function buildPages({root=ROOT,outputPath=path.join(ROOT,'_site'),now=Date.now()}={}){
 root=path.resolve(root);outputPath=path.resolve(outputPath);
 // Validate the actual files that will be copied, including manual/auto conflicts.
 await validateFile(path.join(root,'data/crypto-auto.json'),now,path.join(root,'data/crypto-manual.json'));
 macro.parseSnapshot(JSON.parse(await fs.readFile(path.join(root,'data/macro-calendar.json'),'utf8')),now);
 for(const file of PUBLIC_FILES)if(!(await fs.lstat(path.join(root,file))).isFile())throw new Error('Public file must be a regular file: '+file);
 try{if((await fs.readdir(outputPath)).length)throw new Error('Pages output must be empty; existing artifacts are preserved');}
 catch(error){if(error.code!=='ENOENT')throw error;}
 await fs.mkdir(outputPath,{recursive:true});
 for(const file of PUBLIC_FILES){
  const target=path.join(outputPath,file);await fs.mkdir(path.dirname(target),{recursive:true});
  await fs.copyFile(path.join(root,file),target,constants.COPYFILE_EXCL);
 }
 return [...PUBLIC_FILES].sort();
}
if(require.main===module)(async()=>{
 const args=process.argv.slice(2);
 if(args.length===1&&args[0]==='--check-source'){console.log(JSON.stringify(await verifyPagesSource()));return;}
 if(args.length>1||args[0]?.startsWith('--'))throw new Error('Use build-pages.cjs [empty-output-directory] or --check-source');
 const files=await buildPages(args.length?{outputPath:args[0]}:{});console.log(files.join('\n'));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={PUBLIC_FILES,buildPages,verifyPagesSource};
