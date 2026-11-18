'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {PUBLIC_FILES,buildPages,verifyPagesSource}=require('../scripts/build-pages.cjs');
const {manual,event}=require('./helpers/crypto-hybrid.cjs');
const ROOT=path.resolve(__dirname,'..');
async function list(dir,prefix=''){
 const files=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){
  const name=prefix+entry.name;if(entry.isDirectory())files.push(...await list(path.join(dir,entry.name),name+'/'));else files.push(name);
 }return files.sort();
}
async function setup(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pages-artifact-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
async function fixture(t){
 const dir=await setup(t),root=path.join(dir,'source');
 for(const file of PUBLIC_FILES){const to=path.join(root,file);await fs.mkdir(path.dirname(to),{recursive:true});await fs.copyFile(path.join(ROOT,file),to);}
 return {root,outputPath:path.join(dir,'site')};
}
test('actual Pages artifact contains dashboard dependencies and only manual crypto data',async t=>{
 const dir=await setup(t),outputPath=path.join(dir,'site');await buildPages({outputPath});
 const files=await list(outputPath),html=await fs.readFile(path.join(outputPath,'index.html'),'utf8');
 for(const match of html.matchAll(/(?:src|href)="((?:js|css)\/[^"?#]+)"/g))assert.ok(files.includes(match[1]),'Missing dashboard dependency '+match[1]);
 for(const file of ['data/macro-calendar.json','data/crypto-manual.json'])assert.ok(files.includes(file),file);
 assert.equal(files.length,14);
 assert.ok(files.every(f=>f!=='data/crypto-auto.json'&&!f.startsWith('data/crypto-licenses/')));
 assert.ok(files.every(f=>!/^(?:docs|scripts|tests|\.github)\//.test(f)&&f!=='data/crypto-calendar.json'));
 for(const file of files)assert.deepEqual(await fs.readFile(path.join(outputPath,file)),await fs.readFile(path.join(ROOT,file)),'Changed public bytes: '+file);
});
test('new audit files in public-looking directories never leak into the allowlisted artifact',async t=>{
 const opts=await fixture(t);
 const forbidden=['data/crypto-calendar.json','data/private-audit.json','js/local-test.js','css/local-test.css','docs/audit.md','tests/local.test.js','scripts/private.cjs'];
 for(const file of forbidden){await fs.mkdir(path.dirname(path.join(opts.root,file)),{recursive:true});await fs.writeFile(path.join(opts.root,file),'private fixture');}
 await buildPages(opts);const files=await list(opts.outputPath);
 for(const file of forbidden){assert.ok(!files.includes(file),file);assert.equal(await fs.readFile(path.join(opts.root,file),'utf8'),'private fixture');}
});
test('packaging refuses invalid/conflicting datasets before creating an artifact',async t=>{
 const opts=await fixture(t),m=manual([event({origin:'manual'}),event({origin:'manual',id:'correction',overridesId:'eth-pm:9001',status:'cancelled'})]);
 await fs.writeFile(path.join(opts.root,'data/crypto-manual.json'),JSON.stringify(m));
 await assert.rejects(buildPages({...opts,now:Date.now()}),/Sprzeczne korekty/);await assert.rejects(fs.stat(opts.outputPath),{code:'ENOENT'});
 await fs.writeFile(path.join(opts.root,'data/crypto-manual.json'),'not JSON');await assert.rejects(buildPages(opts));
});
test('packaging preserves previous artifacts and fails when manual data is absent',async t=>{
 const opts=await fixture(t);await fs.mkdir(opts.outputPath);await fs.writeFile(path.join(opts.outputPath,'old-audit.txt'),'preserve');
 await assert.rejects(buildPages(opts),/must be empty/);assert.equal(await fs.readFile(path.join(opts.outputPath,'old-audit.txt'),'utf8'),'preserve');
 await fs.unlink(path.join(opts.root,'data/crypto-manual.json'));
 await assert.rejects(buildPages({...opts,outputPath:opts.outputPath+'-new'}),{code:'ENOENT'});
});
test('corrupt archived automatic data and missing licenses cannot block manual publication',async t=>{
 const opts=await fixture(t),manualData=manual([event({origin:'manual'})]);
 await fs.writeFile(path.join(opts.root,'data/crypto-manual.json'),JSON.stringify(manualData));
 await fs.writeFile(path.join(opts.root,'data/crypto-auto.json'),'broken archived JSON');
 await buildPages(opts);
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(opts.outputPath,'data/crypto-manual.json'),'utf8')),manualData);
 await assert.rejects(fs.stat(path.join(opts.outputPath,'data/crypto-auto.json')),{code:'ENOENT'});
});
test('crypto collector and pilot workflows are retired; manual tests never fetch sources or commit data',async()=>{
 for(const file of ['crypto-calendar.yml','xlm-pilot.yml'])await assert.rejects(fs.stat(path.join(ROOT,'.github/workflows',file)),{code:'ENOENT'});
 const workflow=await fs.readFile(path.join(ROOT,'.github/workflows/crypto-calendar-test.yml'),'utf8');
 assert.doesNotMatch(workflow,/update-crypto-calendar\.cjs|--preview|git (?:commit|push)|schedule:/);
 assert.match(workflow,/crypto-manual\.json/);
});
test('Pages source guard accepts Actions only; Jekyll, unknown configuration, denied and failed reads block publication',async()=>{
 const env={GH_TOKEN:'synthetic-token',GITHUB_REPOSITORY:'fixture/site'};
 const options={env,fetchImpl:async(url,request)=>{assert.equal(url,'https://api.github.com/repos/fixture/site/pages');assert.equal(request.headers.Authorization,'Bearer synthetic-token');assert.equal(request.redirect,'error');assert.equal(request.method,undefined);return Response.json({build_type:'workflow'});}};
 assert.deepEqual(await verifyPagesSource(options),{build_type:'workflow'});
 for(const config of [{build_type:'legacy',source:{branch:'main',path:'/'}},{},null])await assert.rejects(verifyPagesSource({env,fetchImpl:async()=>Response.json(config)}));
 for(const status of [403,404,500])await assert.rejects(verifyPagesSource({env,fetchImpl:async()=>new Response(null,{status})}),/publication blocked/);
 await assert.rejects(verifyPagesSource({env,fetchImpl:async()=>{throw new Error('fixture network failure');}}));
 await assert.rejects(verifyPagesSource({env:{},fetchImpl:async()=>assert.fail('No unauthenticated requests')}));
});
