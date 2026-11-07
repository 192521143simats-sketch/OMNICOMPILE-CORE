import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {createServer,createConnection} from 'node:net';
import {resolve,isAbsolute} from 'node:path';
import mysql from 'mysql2/promise';
import {assertIsolatedTarget,verifyIsolatedCoordinator} from './Integration-Target.mjs';
import {terminateOwnedTestProcess} from './Owned-Test-Process.mjs';
import {localDistributionManifest} from './Local-Distribution.mjs';

const mode=process.argv[2]??'all';
if(!['all','platform','artifacts','enrollment','reusable','execution','results','leases','recovery','cancellation','phase4','compute','web','settings','browser','android-browser','android-native','windows','windows-install','mixed','phase9','metrics'].includes(mode)) throw new Error('Unknown isolated integration mode.');
const root=process.cwd(),instance=randomBytes(8).toString('hex'),container=`omnicompile-test-${instance}`,database=`omnicompile_test_${instance}`;
const password=randomBytes(32).toString('base64url'),rootPassword=randomBytes(32).toString('base64url');
// Operators may keep disposable evidence outside the source tree. The random
// instance directory and target ownership guards remain unchanged.
const evidenceRoot=process.env.OMNICOMPILE_TEST_EVIDENCE_ROOT;
if(evidenceRoot&&!isAbsolute(evidenceRoot))throw new Error('Test evidence root must be absolute.');
if(evidenceRoot&&(mode==='android-native'||mode==='android-browser'||mode==='mixed'&&process.env.OMNICOMPILE_TEST_ANDROID==='1'))throw new Error('Android device fixtures require their existing guarded repository evidence path.');
const startedAt=new Date().toISOString(),evidence=evidenceRoot?resolve(evidenceRoot,instance):resolve(root,'.runtime','integration',instance);
await mkdir(evidence,{recursive:true});
let created=false,coordinator,web,tls,native,coordinatorLog='',exitCode=1;
const results=[];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function command(executable,args,{env=process.env,timeout=30_000,onControl,input}={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{cwd:root,env,windowsHide:true,stdio:onControl?['ignore','pipe','pipe','ipc']:[input===undefined?'ignore':'pipe','pipe','pipe']});
    if(input!==undefined)child.stdin.end(input);
    let output='',settled=false,forcedError;
    const finish=(error,code)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve({code,output});};
    const stop=async(error)=>{forcedError=error;try{await terminateOwnedTestProcess(child);}catch(cause){forcedError=cause;}finish(forcedError);};
    const timer=setTimeout(()=>void stop(new Error(`${executable} timed out after ${timeout} ms`)),timeout);
    child.stdout.on('data',chunk=>{const value=chunk.toString();output+=value;if(mode==='android-browser'&&env.OMNICOMPILE_ANDROID_MANUAL==='1'&&value.includes('MANUAL ACTION:'))console.log(value.trim().replaceAll(password,'[REDACTED]').replaceAll(rootPassword,'[REDACTED]'));if(output.length>2_000_000&&!forcedError)void stop(new Error('Integration command output limit exceeded'));});
    child.stderr.on('data',chunk=>{output+=chunk.toString();});
    child.on('error',error=>finish(error));child.on('close',code=>finish(forcedError,code??-1));
    if(onControl)child.on("message",message=>{void onControl(message.recoveryAction,message).then(()=>child.send({id:message.id}),error=>{const safe=String(error.message).replaceAll(password,'[REDACTED]').replaceAll(rootPassword,'[REDACTED]');results.push({fault:message.recoveryAction,error:safe});console.error(`Owned fault ${message.recoveryAction}: ${safe}`);child.send({id:message.id,error:"Isolated fault control failed; inspect runner logs"});}).catch(()=>{});});
  });
}
async function checked(executable,args,options){const value=await command(executable,args,options);if(value.code!==0) throw new Error(`${executable} failed (exit ${value.code}); see isolated evidence logs`);return value.output.trim();}
async function availablePort(){const server=createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
async function waitFor(work,label,timeout=120_000){const end=Date.now()+timeout;do{try{return await work();}catch{await pause(1000);}}while(Date.now()<end);throw new Error(`Timed out waiting for ${label}`);}
try {
  console.log('Checking Docker engine (bounded; does not modify the developer database)...');
  await checked('docker',['info','--format','{{.ServerVersion}}'],{timeout:30_000});
  console.log(`Creating isolated MySQL fixture ${container} (temporary storage, no developer volume)...`);
  const fixedFixturePort=mode==='phase4'?await availablePort():null;
  await checked('docker',['create','--init','--name',container,'--label',`omnicompile.test.instance=${instance}`,'--memory','768m','--publish',`127.0.0.1:${fixedFixturePort??''}:3307`,'--tmpfs','/var/lib/mysql:rw','--env','MYSQL_ROOT_PASSWORD','--env','MYSQL_DATABASE','--env','MYSQL_USER','--env','MYSQL_PASSWORD','omnicompile-mysql:8.4','mysqld','--port=3307','--innodb-buffer-pool-size=64M','--performance-schema=OFF','--max-connections=80','--table-open-cache=256',...(mode==='phase4'?['--datadir=/omnicompile-test-data']:[])],{timeout:180_000,env:{...process.env,MYSQL_ROOT_PASSWORD:rootPassword,MYSQL_DATABASE:database,MYSQL_USER:'omnicompile_test',MYSQL_PASSWORD:password}});
  created=true;
  await checked('docker',['start',container]);
  const published=await checked('docker',['port',container,'3307/tcp']);
  const dbPort=Number(published.match(/127\.0\.0\.1:(\d+)/)?.[1]);
  if(!dbPort) throw new Error('Isolated MySQL port was not published on loopback.');
  await waitFor(async()=>{const connection=await mysql.createConnection({host:'127.0.0.1',port:dbPort,database,user:'omnicompile_test',password,connectTimeout:2000});try{await connection.query('SELECT 1');}finally{await connection.end();}},'isolated MySQL readiness');
  const port=await availablePort(),base=`http://127.0.0.1:${port}`,webPort=['web','browser','android-browser','mixed'].includes(mode)?await availablePort():null;
  const tlsPort=mode==='browser'&&process.env.OMNICOMPILE_TEST_TLS==='1'?await availablePort():null;
  const env={...process.env,OMNICOMPILE_EXECUTION_MODE:process.env.OMNICOMPILE_EXECUTION_MODE??(mode==='execution'?'docker':'disabled'),TASK_TIMEOUT_MS:mode==='recovery'?'6000':(process.env.TASK_TIMEOUT_MS??'30000'),HEARTBEAT_STALE_MS:mode==='recovery'?'60000':(process.env.HEARTBEAT_STALE_MS??'15000'),HEARTBEAT_OFFLINE_MS:mode==='recovery'?'120000':(process.env.HEARTBEAT_OFFLINE_MS??'30000'),RESEND_ENABLED:'false',POSTHOG_ENABLED:'false',RESEND_API_KEY:'',POSTHOG_PROJECT_KEY:'',NODE_ENV:'development',HOST:'127.0.0.1',PORT:String(port),PUBLIC_BASE_URL:webPort?`http://127.0.0.1:${webPort}`:'http://localhost:5173',COORDINATOR_PUBLIC_URL:base,ALLOWED_ORIGINS:'',TRUSTED_PROXIES:'',DB_HOST:'127.0.0.1',DB_PORT:String(dbPort),DB_NAME:database,DB_USER:'omnicompile_test',DB_PASSWORD:password,ADMIN_USERNAME:'integration-admin',ADMIN_PASSWORD:'IntegrationOnly!42',ADMIN_PASSWORD_HASH:'',OMNICOMPILE_TEST_BASE:base,OMNICOMPILE_TEST_INSTANCE:instance,OMNICOMPILE_TEST_WEB_BASE:webPort?`http://127.0.0.1:${webPort}`:'',OMNICOMPILE_TEST_EVIDENCE:evidence};
  if(process.env.OMNICOMPILE_TEST_LOCAL_DISTRIBUTION==='1')env.OMNICOMPILE_LOCAL_DISTRIBUTION_MANIFEST=JSON.stringify(await localDistributionManifest(root));
  if(tlsPort){env.PUBLIC_BASE_URL=`https://127.0.0.1:${tlsPort}`;env.OMNICOMPILE_TEST_WEB_BASE=env.PUBLIC_BASE_URL;}
  if(mode==='android-browser'){env.PUBLIC_BASE_URL=`http://omnicompile-test-${instance}.localhost:${webPort}`;env.OMNICOMPILE_TEST_WEB_BASE=env.PUBLIC_BASE_URL;}
  if(['windows','windows-install','android-native'].includes(mode))env.PUBLIC_BASE_URL=base;
  function startCoordinator(){coordinator=spawn(process.execPath,['--import','tsx',resolve(root,'apps/coordinator/src/server.ts')],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  coordinator.stdout.on('data',chunk=>{coordinatorLog+=chunk.toString();});coordinator.stderr.on('data',chunk=>{coordinatorLog+=chunk.toString();});
  coordinator.on('error',error=>{coordinatorLog+=`Coordinator spawn failed: ${error.message}`;});}
  startCoordinator();
  async function control(action,message){
    if(action==="startNativeWorker"){
      if(mode!=="web"||native||typeof message?.credential!=="string"||message.credential.length<20||message.credential.length>2048)throw new Error("Invalid owned native fixture request");
      native=spawn(process.execPath,['--import','tsx',resolve(root,'apps/worker/src/index.ts')],{cwd:root,env:{...env,COORDINATOR_URL:base,WORKER_CREDENTIAL:message.credential},windowsHide:true,stdio:['ignore','pipe','pipe']});native.stdout.resume();native.stderr.resume();return;
    }
    const label=await checked("docker",["inspect","--format",'{{ index .Config.Labels "omnicompile.test.instance" }}',container]);
    if(label!==instance)throw new Error("Fixture ownership changed; refusing fault injection");
    if(action==="restartCoordinator"){
      coordinator.kill();await Promise.race([new Promise(resolve=>coordinator.once("exit",resolve)),pause(5000)]);
      if(coordinator.exitCode===null&&coordinator.signalCode===null)throw new Error("Owned coordinator did not exit");
      startCoordinator();await waitFor(()=>verifyIsolatedCoordinator(assertIsolatedTarget(env)),"restarted isolated coordinator",60000);
    }else if(action==="restartMySQL"){
      if(mode!=="phase4")throw new Error("Restart requires persistent owned fixture");
      await checked("docker",["restart",container],{timeout:60000});
      await waitFor(async()=>{const connection=await mysql.createConnection({host:'127.0.0.1',port:dbPort,database,user:'omnicompile_test',password,connectTimeout:2000});try{await connection.query('SELECT 1');}finally{await connection.end();}},'restarted isolated MySQL',60000);
      await waitFor(()=>verifyIsolatedCoordinator(assertIsolatedTarget(env)),"database restart readiness",60000);
    }else if(action==="backupRestoreMySQL"){
      const clone=database+"_restore";
      const rootConnection=await mysql.createConnection({host:'127.0.0.1',port:dbPort,user:'root',password:rootPassword});
      try{
        await rootConnection.query("CREATE DATABASE "+clone);
        const dump=await checked("docker",["exec","--env","MYSQL_PWD",container,"mysqldump","--user=root","--single-transaction","--skip-comments","--set-gtid-purged=OFF","--no-tablespaces",database],{env:{...process.env,MYSQL_PWD:rootPassword}});
        await writeFile(resolve(evidence,"isolated-backup.sql"),dump);
        await checked("docker",["exec","--interactive","--env","MYSQL_PWD",container,"mysql","--user=root",clone],{env:{...process.env,MYSQL_PWD:rootPassword},input:dump});
        for(const table of ["users","distributed_networks","nodes","tasks","task_attempts","results","compilation_jobs","artifacts"]){
          const [[original]]=await rootConnection.query("SELECT COUNT(*) total FROM "+database+"."+table),[[restored]]=await rootConnection.query("SELECT COUNT(*) total FROM "+clone+"."+table);
          if(Number(original.total)!==Number(restored.total))throw new Error("Isolated backup restore row mismatch");
        }
        const [hashes]=await rootConnection.query("SELECT COUNT(*) invalid FROM "+clone+".artifacts WHERE content_sha256<>LOWER(SHA2(content,256)) OR size_bytes<>OCTET_LENGTH(content)");
        if(Number(hashes[0].invalid)!==0)throw new Error("Restored artifact integrity mismatch");
      }finally{await rootConnection.end();}
    }else if(action==="pauseMySQL")await checked("docker",["pause",container]);
    else if(action==="resumeMySQL"){await checked("docker",["unpause",container]);await waitFor(()=>verifyIsolatedCoordinator(assertIsolatedTarget(env)),"resumed isolated MySQL",30000);}
    else throw new Error("Unknown isolated fault action");
  }
  await waitFor(()=>verifyIsolatedCoordinator(assertIsolatedTarget(env)),'isolated coordinator readiness',60_000);
  if(webPort){
    web=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1'],{cwd:resolve(root,'apps/web'),env:{...env,OMNICOMPILE_WEB_PORT:String(webPort),OMNICOMPILE_API_TARGET:base},windowsHide:true,stdio:['ignore','pipe','pipe']});
    web.stdout.on('data',chunk=>{coordinatorLog+=chunk.toString();});web.stderr.on('data',chunk=>{coordinatorLog+=chunk.toString();});
    const viteBase=`http://127.0.0.1:${webPort}`;
    await waitFor(async()=>{const response=await fetch(viteBase);if(!response.ok)throw new Error('Web not ready');},'isolated Vite web',30000);
    if(tlsPort){
      const key=resolve(evidence,'fixture-key.pem'),cert=resolve(evidence,'fixture-cert.pem'),openssl=process.platform==='win32'?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl';
      await checked(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{timeout:30000});
      tls=spawn(process.execPath,[resolve(root,'scripts/Isolated-TLS-Proxy.mjs')],{cwd:root,env:{...env,OMNICOMPILE_TEST_TLS_PORT:String(tlsPort),OMNICOMPILE_TEST_VITE_BASE:viteBase,OMNICOMPILE_TEST_TLS_KEY:key,OMNICOMPILE_TEST_TLS_CERT:cert},windowsHide:true,stdio:['ignore','pipe','pipe']});tls.stdout.on('data',chunk=>{coordinatorLog+=chunk.toString();});tls.stderr.on('data',chunk=>{coordinatorLog+=chunk.toString();});
      await waitFor(()=>new Promise((resolve,reject)=>{const socket=createConnection({host:'127.0.0.1',port:tlsPort});socket.setTimeout(2000);socket.once('connect',()=>{socket.destroy();resolve();});socket.once('error',reject);socket.once('timeout',()=>{socket.destroy();reject(new Error('TLS fixture not ready'));});}),'owned TLS proxy',30000);
    }
  }
  const scripts=mode==='windows-install'?['Verify-Windows-Installation.mjs']:mode==='windows'?['Verify-Windows-Worker.mjs']:mode==='android-browser'?['Verify-Android-Browser.mjs']:mode==='browser'?['Verify-Browser-Worker.mjs']:mode==='settings'?['Verify-Settings.mjs']:mode==='web'?['Verify-Web-Product.mjs']:mode==='compute'?['Verify-Compute-Tasks.mjs']:mode==='phase4'?['Verify-Phase4-Closure.mjs']:mode==='cancellation'?['Verify-Task-Cancellation.mjs']:mode==='recovery'?['Verify-Task-Recovery.mjs']:mode==='leases'?['Verify-Task-Leases.mjs']:mode==='results'?['Verify-Migrations.mjs','Verify-Task-Results.mjs']:mode==='execution'?['Verify-Migrations.mjs','Verify-Execution.mjs']:mode==='reusable'?['Verify-Reusable-Link.mjs']:mode==='enrollment'?['Verify-Migrations.mjs','Verify-Enrollment.mjs']:['Verify-Migrations.mjs','Verify-MySQL-Concurrency.mjs','Verify-Protocol.mjs',...(mode==='all'?['Verify-Task-Results.mjs','Verify-Platform.mjs','Verify-Artifacts.mjs']:[mode==='platform'?'Verify-Platform.mjs':'Verify-Artifacts.mjs'])];
  if(mode==='android-native')scripts.splice(0,scripts.length,'Verify-Android-Native.mjs');
  if(mode==='mixed')scripts.splice(0,scripts.length,'Verify-Mixed-Workers.mjs');
  if(mode==='metrics')scripts.splice(0,scripts.length,'Verify-Compiler-Metrics.mjs');
  if(mode==='phase9')scripts.splice(0,scripts.length,'Verify-Phase9.mjs');
  for(const script of scripts){
    console.log(`Running ${script} against isolated test MySQL and coordinator...`);
    const result=await command(process.execPath,['--import','tsx',resolve(root,'scripts',script)],{env,timeout:['windows-install','android-native','mixed'].includes(mode)?600000:mode==='android-browser'&&env.OMNICOMPILE_ANDROID_MANUAL==='1'?900_000:300_000,...(['Verify-Task-Recovery.mjs','Verify-Phase4-Closure.mjs','Verify-Web-Product.mjs','Verify-Browser-Worker.mjs','Verify-Windows-Worker.mjs','Verify-Windows-Installation.mjs','Verify-Android-Native.mjs','Verify-Mixed-Workers.mjs'].includes(script)?{onControl:control}:{})});
    await writeFile(resolve(evidence,`${script}.log`),result.output);
    results.push({script,exitCode:result.code});
    if(result.code!==0){
      // Retain actionable failure diagnostics even when disposable evidence is
      // removed on exit. This runner never uses the developer database secrets.
      console.error(result.output.replaceAll(password,'[REDACTED]').replaceAll(rootPassword,'[REDACTED]').slice(-8000));
      throw new Error(`${script} failed; inspect ${evidence}`);
    }
    console.log(`${script}: passed`);
  }
  exitCode=0;
}catch(error){console.error(error.message);results.push({error:error.message});}
finally {
  if(tls)try{await terminateOwnedTestProcess(tls);}catch(error){exitCode=1;results.push({cleanupError:error.message});}
  if(native)try{await terminateOwnedTestProcess(native);}catch(error){exitCode=1;results.push({cleanupError:error.message});}
  if(web&&web.exitCode===null){web.kill();await Promise.race([new Promise(resolve=>web.once('exit',resolve)),pause(5000)]);}
  if(coordinator && coordinator.exitCode===null){coordinator.kill();await Promise.race([new Promise(resolve=>coordinator.once('exit',resolve)),pause(5000)]);}
  // Only this runner's freshly created, labelled temporary fixture is removable.
  if(created){try{const label=await checked('docker',['inspect','--format','{{ index .Config.Labels "omnicompile.test.instance" }}',container]);if(label!==instance) throw new Error('Test container ownership changed; refusing cleanup');await checked('docker',['rm','--force',container]);}catch(error){console.error(`Isolated cleanup failed: ${error.message}`);exitCode=1;results.push({cleanupError:error.message});}}
  for(const secret of [password,rootPassword])coordinatorLog=coordinatorLog.replaceAll(secret,'[REDACTED]');
  await writeFile(resolve(evidence,'coordinator.log'),coordinatorLog);
  await writeFile(resolve(evidence,'summary.json'),JSON.stringify({instance,startedAt,finishedAt:new Date().toISOString(),mode,exitCode,results},null,2)+'\n');
  console.log(`Evidence: ${evidence}`);
  if(process.env.OMNICOMPILE_TEST_CLEANUP_EVIDENCE==='1'&&evidenceRoot){
    // Only this invocation's random child can be removed, never the evidence
    // root, developer data, or evidence belonging to another run.
    if(evidence!==resolve(evidenceRoot,instance)||!/^[a-f0-9]{16}$/.test(instance))throw new Error('Unsafe temporary evidence cleanup target');
    if(exitCode!==0&&coordinatorLog.trim()) console.error(coordinatorLog.slice(-12000));
    await rm(evidence,{recursive:true,force:true});
    console.log(`Removed disposable evidence for ${instance}; exit=${exitCode}.`);
  }
  process.exitCode=exitCode;
}
