import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import mysql from 'mysql2/promise';
import {assertIsolatedTarget,verifyIsolatedCoordinator} from './Integration-Target.mjs';
import {terminateOwnedTestProcess} from './Owned-Test-Process.mjs';

const target=assertIsolatedTarget();await verifyIsolatedCoordinator(target);
const evidence=process.env.OMNICOMPILE_TEST_EVIDENCE;if(!evidence)throw new Error('Owned evidence directory required.');
const apk=resolve('apps/android-worker/app/build/outputs/apk/debug/app-debug.apk'),testApk=resolve('apps/android-worker/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk');
await stat(apk);await stat(testApk);
const adb=process.env.OMNICOMPILE_ADB??'adb';
const run=args=>execFileSync(adb,args,{encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:2_000_000});
const devices=run(['devices']).split(/\r?\n/).filter(line=>/^\S+\s+device$/.test(line.trim())).map(line=>line.split(/\s+/)[0]);
const serial=process.env.ANDROID_SERIAL??(devices.length===1?devices[0]:undefined);
if(!serial||!devices.includes(serial))throw new Error('Exactly one authorized phone, or ANDROID_SERIAL naming an authorized phone, is required.');
const phone=(...args)=>run(['-s',serial,...args]);
const port=new URL(target.base).port,mapping=`tcp:${port}`;
if(phone('reverse','--list').split(/\r?\n/).some(line=>line.split(/\s+/).includes(mapping)))throw new Error('Refusing to replace an existing ADB reverse mapping.');
let cookie='',instrument,exited,db,network,createdReverse=false,deviceLog='';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function api(path,body,userCookie=cookie){const response=await fetch(target.base+path,{method:body===undefined?'GET':'POST',headers:{origin:target.base,...(body===undefined?{}:{'content-type':'application/json'}),...(userCookie?{cookie:userCookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});assert.ok(response.ok,`Isolated API rejected ${path.split('?')[0]} (${response.status})`);if(path==='/api/auth/login')cookie=response.headers.get('set-cookie')?.split(';')[0]??'';return response.status===204?null:response.json();}
async function poll(work,predicate,timeout=60000){const end=Date.now()+timeout;while(Date.now()<end){const value=await work();if(predicate(value))return value;if(instrument?.exitCode!==null&&instrument?.exitCode!==undefined)throw new Error('Phone instrumentation ended before expected persisted state.');await pause(500);}throw new Error('Physical Android acceptance timed out.');}
async function restart(){const id=crypto.randomUUID();await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{process.off('message',receive);reject(new Error('Owned coordinator restart timeout'));},60000);function receive(message){if(message.id!==id)return;clearTimeout(timer);process.off('message',receive);message.error?reject(new Error('Owned coordinator restart failed')):resolve();}process.on('message',receive);process.send?.({id,recoveryAction:'restartCoordinator'});});}
try {
  // Updating this app preserves its existing encrypted data. The device test
  // refuses an existing enrollment instead of resetting or leaving user work.
  if(process.env.OMNICOMPILE_ANDROID_PREINSTALLED==='1'){
    for(const [name,file]of [['org.omnicompile.worker',apk],['org.omnicompile.worker.test',testApk]]){
      const installed=phone('shell','pm','path',name).trim();assert.match(installed,/^package:\/data\/app\/[A-Za-z0-9_./=+~-]+\.apk$/);
      const remote=phone('shell','sha256sum',installed.slice('package:'.length)).trim().split(/\s+/)[0];
      assert.equal(remote,createHash('sha256').update(await readFile(file)).digest('hex'),'Installed APK differs from current verified build.');
    }
  }else{phone('install','-r','-t',apk);phone('install','-r','-t',testApk);}
  await api('/api/auth/login',{identifier:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD});
  network=await api('/api/admin/networks',{name:`Native Android acceptance ${target.instance}`,maxNodes:2});
  assert.equal(new URL(network.joinUrl).origin,target.base);
  phone('reverse',mapping,mapping);createdReverse=true;
  db=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),database:target.database,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
  instrument=spawn(adb,['-s',serial,'shell','am','instrument','-w','-e','class','org.omnicompile.worker.NativeNetworkTest','-e','omnicompileJoin',network.joinUrl,'-e','omnicompileInstance',target.instance,'org.omnicompile.worker.test/androidx.test.runner.AndroidJUnitRunner'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  instrument.stdout.on('data',chunk=>deviceLog+=chunk);instrument.stderr.on('data',chunk=>deviceLog+=chunk);
  exited=new Promise((resolve,reject)=>{instrument.once('error',reject);instrument.once('exit',code=>resolve(code));});
  const node=await poll(async()=>{const[rows]=await db.execute('SELECT * FROM nodes WHERE network_id=? AND worker_type=\'ANDROID\' AND status=\'AVAILABLE\'',[network.id]);return rows[0];},Boolean,90000);
  assert.match(node.id,/^NODE-[A-Z]+\d{3,}$/);
  const profile=typeof node.profile_json==='string'?JSON.parse(node.profile_json):node.profile_json;
  assert.equal(profile.workerType,'ANDROID');assert.equal(profile.runtimes.c,false);assert.equal(profile.runtimes.python,false);assert.equal(profile.runtimes.java,false);assert.equal(profile.operations.nativeCompilation,false);assert.equal(profile.operations.irOptimization,true);
  const tasks=[];
  for(const payload of [{operation:'sha256',input:'abc'},{operation:'prime_count',limit:100},{operation:'sha256_chain',input:'abc',iterations:1},{operation:'matrix_multiply',left:[[2,3]],right:[[4],[5]]},{operation:'portable_benchmark',seed:1,iterations:1}]) {
    if(tasks.length===2){await restart();await poll(async()=>{const[rows]=await db.execute('SELECT status FROM nodes WHERE id=?',[node.id]);return rows[0]?.status;},status=>status==='AVAILABLE');}
    const task=await api('/api/admin/tasks/test',{networkId:network.id,payload});tasks.push(task.id);
    await poll(()=>api('/api/admin/tasks/'+task.id),value=>value.status==='COMPLETED',45000);
  }
  const cancelled=await api('/api/admin/tasks/test',{networkId:network.id,payload:{operation:'sha256_chain',input:'bounded cancellation acceptance',iterations:10000000}});
  await poll(()=>api('/api/admin/tasks/'+cancelled.id),value=>value.status==='RUNNING',10000);
  assert.equal((await api('/api/admin/tasks/'+cancelled.id+'/cancel',{})).status,'CANCELLED');
  await poll(async()=>{const[rows]=await db.execute('SELECT status FROM nodes WHERE id=?',[node.id]);return rows[0]?.status;},value=>value==='AVAILABLE');
  const[cancelledResults]=await db.execute('SELECT task_id FROM results WHERE task_id=?',[cancelled.id]);assert.equal(cancelledResults.length,0);
  const email=`android-${target.instance}@example.test`,password='AndroidFixtureOnly!42';
  await api('/api/auth/signup',{name:'Native Android compiler fixture',email,password,confirmPassword:password});
  const adminCookie=cookie;await api('/api/auth/login',{identifier:email,password});const userCookie=cookie;cookie=adminCookie;
  const job=await api('/api/compilations',{language:'c',sourceName:'AndroidFixture.c',source:'int main(void){int x=2+3;return x-5;}'},userCookie);
  const completed=await poll(()=>api('/api/compilations/'+job.id,undefined,userCookie),value=>value.status==='COMPLETED',120000);
  const[irAttempts]=await db.execute("SELECT a.node_id FROM task_attempts a JOIN tasks t ON t.id=a.task_id JOIN optimization_batch_tasks bt ON bt.task_id=t.id JOIN compilation_jobs j ON j.batch_id=bt.batch_id WHERE j.id=? AND t.kind='C_OPTIMIZE_IR' AND a.status='COMPLETED'",[job.id]);
  assert.ok(irAttempts.length>0);assert.ok(irAttempts.every(row=>row.node_id===node.id));
  assert.ok(completed.artifacts.length>0);
  for(const artifact of completed.artifacts){const response=await fetch(target.base+artifact.downloadUrl,{headers:{cookie:userCookie},signal:AbortSignal.timeout(15000)});assert.equal(response.status,200);assert.ok((await response.arrayBuffer()).byteLength>0);}
  await exited;assert.match(deviceLog,/OK \(1 test\)/);assert.doesNotMatch(deviceLog,/FAILURES!!!|INSTRUMENTATION_FAILED/);
  const[results]=await db.query('SELECT r.result_json result,a.node_id FROM results r JOIN task_attempts a ON a.task_id=r.task_id AND a.attempt=r.attempt WHERE r.task_id IN (?)',[tasks]);
  assert.equal(results.length,5);assert.ok(results.every(row=>row.node_id===node.id));
  const values=results.map(row=>typeof row.result==='string'?JSON.parse(row.result):row.result);
  assert.equal(values.find(v=>v.operation==='sha256').digest,'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(values.find(v=>v.operation==='prime_count').count,25);
  assert.deepEqual(values.find(v=>v.operation==='matrix_multiply').matrix,[[23]]);
  assert.equal(values.find(v=>v.operation==='portable_benchmark').checksum,1015568748);
  const[left]=await db.execute('SELECT revoked_at FROM nodes WHERE id=?',[node.id]);assert.ok(left[0].revoked_at);
  console.log(JSON.stringify({physicalAndroid:'passed',model:phone('shell','getprop','ro.product.model').trim(),nativePortableResults:5,irOptimization:'persisted and verified',nativeCompilerToolchains:'not advertised',coordinatorRestart:'passed',taskCancellationReconnect:'passed',pauseRecreateResumeDisconnectLeave:'passed',authorizedArtifacts:'downloaded'}));
} finally {
  if(instrument&&instrument.exitCode===null){
    // Tell only this isolated network to stop. Give the instrumentation's
    // finally block time to acknowledge leave while the coordinator is alive.
    if(network)try{await api('/api/admin/networks/'+network.id+'/disable',{});}catch{}
    await Promise.race([exited,pause(70000)]);
    if(instrument.exitCode===null)await terminateOwnedTestProcess(instrument);
  }
  if(db)await db.end();
  if(createdReverse)phone('reverse','--remove',mapping);
  const scrubbed=network?deviceLog.replaceAll(network.joinUrl,'[REDACTED admission URL]'):deviceLog;
  await writeFile(resolve(evidence,'android-native-instrumentation.log'),scrubbed);
}
