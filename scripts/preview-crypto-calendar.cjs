'use strict';
// Local HTTP preview of the existing dashboard; never collects or publishes data.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
function parseArgs(args){const options={port:4173};for(let i=0;i<args.length;i++){if(args[i]==='--offline')continue;else if(args[i]==='--xlm')throw new Error('Legacy XLM preview is retired; no restricted source is fetched by the hybrid preview');else if(args[i]==='--port'){options.port=Number(args[++i]);if(!Number.isInteger(options.port)||options.port<1024||options.port>65535)throw new Error('Invalid local port');}else throw new Error('Unknown argument: '+args[i]);}return options;}
function fileFor(url){const pathname=new URL(url,'http://127.0.0.1').pathname;if(pathname==='/'||pathname==='/index.html')return 'index.html';if(/^\/(?:css\/[a-z0-9-]+\.css|js\/[a-z0-9-]+\.js|data\/[a-z0-9-]+\.json|data\/crypto-licenses\/[A-Za-z0-9.-]+\.txt)$/.test(pathname))return pathname.slice(1);return null;}
async function start({port=4173}={}){
 const server=http.createServer(async(req,res)=>{
   if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
   let file;try{file=fileFor(req.url);}catch{res.writeHead(400);res.end();return;}
   if(!file){res.writeHead(404);res.end('Not found');return;}
   try{const body=await fs.readFile(path.join(ROOT,file));const type={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.txt':'text/plain'}[path.extname(file)];res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?null:body);}
   catch{res.writeHead(404);res.end('Not found');}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 console.log('Local preview: http://127.0.0.1:'+port+'/');return server;
}
if(require.main===module)start(parseArgs(process.argv.slice(2))).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={start,fileFor,parseArgs};
