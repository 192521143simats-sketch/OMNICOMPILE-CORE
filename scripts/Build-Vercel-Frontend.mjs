import {spawnSync} from 'node:child_process';
const origin='https://omnicompile-core-platform.vercel.app';
const env={...process.env,VITE_BACKEND_MODE:'remote',VITE_API_BASE_URL:origin,VITE_WS_BASE_URL:origin.replace('https:','wss:'),VITE_REALTIME_TICKETS:'true'};
const result=process.platform==='win32'
  ?spawnSync('cmd.exe',['/d','/s','/c','npm run build -w @omnicompile/web'],{stdio:'inherit',env})
  :spawnSync('npm',['run','build','-w','@omnicompile/web'],{stdio:'inherit',env});
if(result.error)throw result.error;
process.exit(result.status??1);
