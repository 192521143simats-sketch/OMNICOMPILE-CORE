// Publishes only built static assets and routing metadata. Never uploads .env,
// database data, SSH keys, compiler credentials, or the repository working tree.
import {readFileSync,writeFileSync,mkdirSync,cpSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const backend=readFileSync('.runtime/online-demo/url.txt','utf8').trim();
if(!/^https:\/\/[a-z0-9-]+\.ngrok-free\.app$/.test(backend))throw new Error('Unexpected backend tunnel origin.');
const build=spawnSync(process.execPath,['scripts/Build-Vercel-Frontend.mjs'],{stdio:'inherit'});
if(build.status!==0)throw new Error('Build failed; nothing published.');
const routes=[
  {src:'/(.*)',headers:{'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'},continue:true},
  {src:'/api(?:/(.*))?',dest:backend+'/api/$1',headers:{'Cache-Control':'private, no-store','CDN-Cache-Control':'no-store','Vercel-CDN-Cache-Control':'no-store'},transforms:[{type:'request.headers',op:'set',target:{key:'ngrok-skip-browser-warning'},args:'1'}]},
  // Browsers use authenticated direct WSS tickets. Do not claim this HTTP
  // rewrite implements WebSocket upgrades for existing native applications.
  {src:'/ws(?:/(.*))?',dest:backend+'/ws/$1'},
  {handle:'filesystem'},
  {src:'/(?:login|signup|forgot-password|reset-password|admin|dashboard|worker|web-worker|browser-worker|windows-worker|android-worker|settings|compute)/?',dest:'/index.html'},
  {src:'/join/[^/]+(?:/(?:web|windows|android))?/?',dest:'/index.html'},
  {src:'/',dest:'/index.html'},
  {src:'/.*',dest:'/index.html',status:404},
];
const config=JSON.parse(readFileSync('vercel.json','utf8'));
delete config.rewrites;delete config.headers;
config.buildCommand='node scripts/Build-Vercel-Frontend.mjs';config.routes=routes;
writeFileSync('vercel.json',JSON.stringify(config,null,2)+'\n');
mkdirSync('.vercel/output/static',{recursive:true});
cpSync('apps/web/dist','.vercel/output/static',{recursive:true});
writeFileSync('.vercel/output/config.json',JSON.stringify({version:3,routes},null,2));
const result=process.platform==='win32'
  ?spawnSync('cmd.exe',['/d','/s','/c','vercel deploy --prebuilt --prod --yes'],{stdio:'inherit'})
  :spawnSync('vercel',['deploy','--prebuilt','--prod','--yes'],{stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status??1);
