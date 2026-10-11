'use strict';
// Local-only preview and six-hour collector. No GitHub workflow or deployment.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {generate}=require('./generate-crypto-calendar.cjs');
const ROOT=path.resolve(__dirname,'..'),REFRESH_MS=6*3600000;
function parseArgs(args){const options={port:4173,offline:false};for(let i=0;i<args.length;i++){if(args[i]==='--offline')options.offline=true;else if(args[i]==='--port'){options.port=Number(args[++i]);if(!Number.isInteger(options.port)||options.port<1024||options.port>65535)throw new Error('Invalid local port');}else throw new Error('Unknown argument: '+args[i]);}return options;}
function fileFor(url){const pathname=new URL(url,'http://127.0.0.1').pathname;if(pathname==='/'||pathname==='/index.html')return 'index.html';if(/^\/(?:css\/[a-z0-9-]+\.css|js\/[a-z0-9-]+\.js|data\/[a-z0-9-]+\.json)$/.test(pathname))return pathname.slice(1);return null;}
async function start({port=4173,offline=false}={}){
 let updating=false;
 async function refresh(){if(updating)return;updating=true;try{const result=await generate({offline});console.log('Crypto calendar: '+result.events.length+' events; '+Object.entries(result.sources).map(([id,s])=>id+'='+s.status).join(', '));}catch(e){console.error('Update failed; previous JSON preserved: '+e.message);}finally{updating=false;}}
 await refresh();
 const server=http.createServer(async(req,res)=>{
   if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
   let file;try{file=fileFor(req.url);}catch{res.writeHead(400);res.end();return;}
   if(!file){res.writeHead(404);res.end('Not found');return;}
   try{const body=await fs.readFile(path.join(ROOT,file));const type={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json'}[path.extname(file)];res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?null:body);}
   catch{res.writeHead(404);res.end('Not found');}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 const timer=setInterval(refresh,REFRESH_MS);server.once('close',()=>clearInterval(timer));
 console.log('Local preview: http://127.0.0.1:'+port+'/');return server;
}
if(require.main===module)start(parseArgs(process.argv.slice(2))).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={start,fileFor,parseArgs};
