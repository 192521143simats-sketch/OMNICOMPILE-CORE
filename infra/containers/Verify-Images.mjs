// Local, disposable container acceptance. Never reads .env or mounts host data.
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const instance=randomBytes(8).toString('hex'),prefix=`omnicompile-image-${instance}`;
const network=prefix,db=`${prefix}-mysql`,api=`${prefix}-api`,web=`${prefix}-web`;
const owned=[];let networkCreated=false;
const coordinatorImage=process.env.OMNICOMPILE_COORDINATOR_IMAGE??'be-omnicompile-coordinator:local';
const webImage=process.env.OMNICOMPILE_WEB_IMAGE??'fe-omnicompile-frontend:local';
const env={...process.env,MYSQL_ROOT_PASSWORD:randomBytes(32).toString('hex'),MYSQL_DATABASE:`omnicompile_test_${instance}`,MYSQL_USER:'omnicompile_test',MYSQL_PASSWORD:randomBytes(32).toString('hex'),ADMIN_PASSWORD:randomBytes(32).toString('hex')};
Object.assign(env,{DB_HOST:db,DB_PORT:'3306',DB_NAME:env.MYSQL_DATABASE,DB_USER:env.MYSQL_USER,DB_PASSWORD:env.MYSQL_PASSWORD});
env.MYSQL_PWD=env.MYSQL_PASSWORD;
function docker(args){const result=spawnSync('docker',args,{env,encoding:'utf8',timeout:180000,windowsHide:true,maxBuffer:2_000_000});if(result.error||result.status!==0)throw new Error(`Docker operation failed: ${args[0]} (${result.status}); ${String(result.stderr).slice(-1000)}`);return result.stdout.trim();}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(work,label){for(let i=0;i<90;i++){try{return await work();}catch{await pause(1000);}}throw new Error(`Timed out: ${label}`);}
function create(name,args){docker(['create','--init','--name',name,'--network',network,'--label',`omnicompile.image-test=${instance}`,...args]);owned.push(name);docker(['start',name]);}
try{
 console.log(`Creating isolated image fixture ${prefix} (no developer volume).`);
 docker(['network','create','--label',`omnicompile.image-test=${instance}`,network]);networkCreated=true;
 create(db,['--memory','768m','--tmpfs','/var/lib/mysql:rw','--env','MYSQL_ROOT_PASSWORD','--env','MYSQL_DATABASE','--env','MYSQL_USER','--env','MYSQL_PASSWORD','mysql:8.4','mysqld','--innodb-buffer-pool-size=64M','--performance-schema=OFF','--max-connections=80','--table-open-cache=256']);
 await wait(()=>docker(['exec','--env','MYSQL_PWD',db,'mysql','-u','omnicompile_test','-e','SELECT 1',env.MYSQL_DATABASE]),'temporary MySQL');
 const dbEnv=Object.keys(env).filter(key=>key.startsWith('DB_')).flatMap(key=>['--env',key]);
 for(const mode of ['apply','check']){console.log(`Verifying container migration ${mode}.`);docker(['run','--rm','--network',network,...dbEnv,'--env',`OMNICOMPILE_MIGRATION_MODE=${mode}`,coordinatorImage,'node','--import','tsx','apps/coordinator/src/migrate.ts']);}
 create(api,['--read-only','--tmpfs','/tmp:rw,nosuid,size=512m,mode=1777','--cap-drop','ALL','--security-opt','no-new-privileges','--network-alias','coordinator','--memory','768m','--publish','127.0.0.1::4211',...dbEnv,'--env','ADMIN_PASSWORD','--env','ADMIN_USERNAME=image-admin','--env','NODE_ENV=development','--env','HOST=0.0.0.0','--env','PORT=4211','--env',`OMNICOMPILE_TEST_INSTANCE=${instance}`,'--env','OMNICOMPILE_MIGRATION_MODE=check','--env','OMNICOMPILE_EXECUTION_MODE=disabled','--env','PUBLIC_BASE_URL=http://localhost:5173',coordinatorImage]);
 const port=Number(docker(['port',api,'4211/tcp']).split(':').at(-1));const base=`http://127.0.0.1:${port}`;
 await wait(async()=>{const response=await fetch(base+'/ready',{signal:AbortSignal.timeout(3000)});assert.equal(response.status,200);assert.equal((await response.json()).testInstance,instance);},'container coordinator readiness');
 // Compile real newer-language syntax in a disposable container temp directory.
 // This catches worker/verifier toolchain drift without touching project files.
 const compilerProbe=`const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');const root=fs.mkdtempSync(path.join(os.tmpdir(),'omni-toolchain-'));function run(command,args){const result=spawnSync(command,args,{encoding:'utf8',timeout:30000});if(result.error||result.status!==0)throw new Error(command+' failed: '+String(result.stderr));return(result.stdout+result.stderr).trim();}try{const versions={node:process.version,python:run('python',['--version']),java:run('javac',['--version']),gcc:run('gcc',['-dumpfullversion'])};if(!/^Python 3\\.14\\./.test(versions.python)||!/^javac 21\\./.test(versions.java))throw new Error('Coordinator toolchain generation mismatch');fs.writeFileSync(path.join(root,'Syntax21.java'),'record Point(int x, int y) {} class Syntax21 { static int total(Object value) { return switch(value) { case Point(int x, int y) -> x + y; default -> 0; }; } }');run('javac',[path.join(root,'Syntax21.java')]);fs.writeFileSync(path.join(root,'syntax.py'),'type Coordinates = tuple[int, int]\\n');run('python',['-m','py_compile',path.join(root,'syntax.py')]);console.log(JSON.stringify({...versions,javaRecordPattern:true,pythonTypeAlias:true}));}finally{fs.rmSync(root,{recursive:true,force:true});}`;
 const toolchains=JSON.parse(docker(['exec',api,'node','-e',compilerProbe]));
 async function post(path,body,cookie){return fetch(base+path,{method:'POST',signal:AbortSignal.timeout(10000),headers:{origin:'http://localhost:5173','content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});}
 const login=await post('/api/auth/login',{identifier:'image-admin',password:env.ADMIN_PASSWORD});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await fetch(base+'/version',{signal:AbortSignal.timeout(5000)}).then(response=>response.json())).application,'OmniCompile Core');
 const denied=await fetch(base+'/api/user/compiler-metrics',{headers:{cookie},signal:AbortSignal.timeout(10000)});assert.equal(denied.status,403);
 const userPassword=`ImageOnly!42${randomBytes(16).toString('hex')}`,email=`image-${instance}@example.org`;
 assert.equal((await post('/api/auth/signup',{name:'Image acceptance user',email,password:userPassword,confirmPassword:userPassword})).status,201);
 const userLogin=await post('/api/auth/login',{identifier:email,password:userPassword});assert.equal(userLogin.status,200);const userCookie=userLogin.headers.get('set-cookie').split(';')[0];
 const ownMetrics=await fetch(base+'/api/user/compiler-metrics',{headers:{cookie:userCookie},signal:AbortSignal.timeout(10000)});assert.equal(ownMetrics.status,200);const snapshot=await ownMetrics.json();assert.equal(snapshot.scope,'OWN_JOBS');assert.equal(snapshot.tasks.totalCompleted,0);assert.equal(snapshot.tasks.successRate,null);assert.equal(snapshot.verification.rate,null);
 const created=await post('/api/admin/networks',{name:'Image isolated acceptance',maxNodes:2,requireAdminApproval:true},cookie);assert.equal(created.status,201);const result=await created.json();
 const token=result.joinUrl.split('/').at(-1);const join=await fetch(base+'/api/join/'+token,{signal:AbortSignal.timeout(10000)});assert.equal(join.status,200);
 const accepted=await post('/api/join/'+token+'/accept',{consent:true,workerType:'NATIVE',deviceIdentity:`image-${instance}`});assert.equal(accepted.status,201);assert.equal((await accepted.json()).approvalStatus,'PENDING');
 create(web,['--publish','127.0.0.1::8080','--env','COORDINATOR_UPSTREAM=coordinator:4211',webImage]);const webPort=Number(docker(['port',web,'8080/tcp']).split(':').at(-1));
 await wait(async()=>{const response=await fetch(`http://127.0.0.1:${webPort}/join/image-smoke`,{signal:AbortSignal.timeout(3000)});assert.equal(response.status,200);assert.match(await response.text(),/<div id="root"><\/div>/);},'built SPA route fallback');
 const viaWeb=await fetch(`http://127.0.0.1:${webPort}/api/product/info`,{headers:{cookie:userCookie},signal:AbortSignal.timeout(10000)});assert.equal(viaWeb.status,200);assert.equal((await viaWeb.json()).application,'OmniCompile Core');
 assert.equal((await fetch(`http://127.0.0.1:${webPort}/api/product/info`,{signal:AbortSignal.timeout(10000)})).status,401);
 assert.equal(docker(['exec',web,'id','-u']),'101');assert.equal(docker(['exec',api,'id','-u']),'1000');
 console.log(JSON.stringify({instance,coordinatorImage:docker(['image','inspect',coordinatorImage,'--format','{{.Id}}']),webImage:docker(['image','inspect',webImage,'--format','{{.Id}}']),migrationApply:true,migrationCheck:true,coordinatorReady:true,toolchains,login:true,network:true,pendingEnrollment:true,ownMetrics:true,adminMetricsForbidden:true,productName:true,spaFallback:true,authenticatedReverseProxy:true,anonymousProxyDenied:true,nonRoot:true,publicInternet:false}));
}catch(error){
 for(const name of owned){try{let log=docker(['logs','--tail','30',name]);for(const key of ['MYSQL_ROOT_PASSWORD','MYSQL_PASSWORD','MYSQL_PWD','DB_PASSWORD','ADMIN_PASSWORD'])log=log.replaceAll(env[key],'[REDACTED]');console.error(`${name}: ${log}`);}catch{}}
 throw error;
}finally{
 const errors=[];
 for(const name of owned.reverse()){
  try{
   const label=docker(['inspect','--format','{{ index .Config.Labels "omnicompile.image-test" }}',name]);assert.equal(label,instance);
   for(let attempt=0;;attempt++){
    try{docker(['rm','--force','--volumes',name]);break;}
    catch(error){if(attempt===4)throw error;await pause(1000);}
   }
  }catch(error){errors.push(error);}
 }
 if(networkCreated)try{assert.equal(docker(['network','inspect','--format','{{ index .Labels "omnicompile.image-test" }}',network]),instance);docker(['network','rm',network]);}catch(error){errors.push(error);}
 if(errors.length)throw new AggregateError(errors,'Owned image fixture cleanup failed; all resources were attempted');
}
