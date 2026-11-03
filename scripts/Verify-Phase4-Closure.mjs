import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {resolve} from 'node:path';
import WebSocket from 'ws';
import {encodeProtocolMessage,parseCoordinatorMessage} from '@omnicompile/contracts';
import {Store} from '../apps/coordinator/src/database.ts';
import {NetworkService} from '../apps/coordinator/src/networks.ts';
import {assertIsolatedTarget,verifyIsolatedCoordinator} from './Integration-Target.mjs';
const target=assertIsolatedTarget();await verifyIsolatedCoordinator(target);
if(!process.send)throw new Error('Owned isolated runner IPC required');
let serial=0;const pending=new Map();
process.on('message',message=>{const item=pending.get(message.id);if(item){pending.delete(message.id);message.error?item.reject(new Error(message.error)):item.resolve();}});
const fault=action=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Fault control deadline: '+action));},90000);pending.set(id,{resolve:()=>{clearTimeout(timer);resolve();},reject:error=>{clearTimeout(timer);reject(error);}});process.send({id,recoveryAction:action});});
const config={host:process.env.DB_HOST,port:Number(process.env.DB_PORT),name:target.database,user:process.env.DB_USER,password:process.env.DB_PASSWORD};
const store=await Store.connect(config),networks=new NetworkService(store.pool);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const profile={workerType:'BROWSER',deviceType:'DESKTOP',cpuModel:'Phase4 protocol fixture',logicalCores:2,totalMemoryBytes:4e9,operatingSystem:'Test only',architecture:'browser',runtimes:{c:false,python:false,java:false},toolchains:{c:{available:false},python:{available:false},java:{available:false}},operations:{irOptimization:true,staticAnalysis:true,browserCompute:true,nativeCompilation:false,portableMatrix:true,portableBenchmark:true}};
const resources=()=>({cpuUtilizationPercent:1,freeMemoryBytes:2e9,memoryUtilizationPercent:50,observedAt:new Date().toISOString()});
let native,logical;
async function poll(read,predicate,timeout=45000){const end=Date.now()+timeout;while(Date.now()<end){const value=await read();if(predicate(value))return value;await pause(100);}throw new Error('Phase4 verification deadline');}
async function request(path,body,cookie,method=body?'POST':'GET'){const response=await fetch(target.base+path,{method,headers:{origin:process.env.PUBLIC_BASE_URL,...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,body:response.status===204?null:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
try{
  const [admins]=await store.pool.query("SELECT id FROM users WHERE role='ADMIN' LIMIT 1");
  const network=await networks.create({name:'Phase4 persistent fault fixture',description:'',maxNodes:3,expiresAt:null},admins[0].id);
  const enroll=await networks.createEnrollment(network.joinToken,'BROWSER','phase4-device',true),node=await networks.register(enroll.credential,profile);await store.heartbeat(node.nodeId,resources());
  const task=store.id('TASK');await store.pool.execute("INSERT INTO tasks(id,network_id,kind,payload_json,required_capability,status,created_at,deadline_at) VALUES(?,?,'TEST_COMPUTE',?,'base','QUEUED',?,TIMESTAMPADD(SECOND,300,UTC_TIMESTAMP(3)))",[task,network.id,JSON.stringify({operation:'prime_count',limit:10}),store.now()]);
  await store.assignTask(task,node.nodeId,1,'Persisted retry fixture');await store.setTaskRunning(task,node.nodeId,1);
  await store.failTask(task,node.nodeId,1,'Deliberate isolated transient failure');
  await assert.rejects(()=>store.assignTask(task,node.nodeId,1,'Backoff must reject immediate retry'),/assignable/);
  const [before]=await store.pool.execute('SELECT next_eligible_at nextEligible,deadline_at deadline FROM tasks WHERE id=?',[task]);
  assert.ok(before[0].nextEligible instanceof Date);
  console.log('Phase4: restarting owned MySQL');await fault('restartMySQL');
  const [after]=await store.pool.execute('SELECT next_eligible_at nextEligible,deadline_at deadline FROM tasks WHERE id=?',[task]);
  assert.equal(after[0].nextEligible.toISOString(),before[0].nextEligible.toISOString());assert.equal(after[0].deadline.toISOString(),before[0].deadline.toISOString());
  console.log('Phase4: restarting owned coordinator');await fault('restartCoordinator');
  console.log('Phase4: re-registering device');await networks.register(enroll.credential,profile);await store.heartbeat(node.nodeId,resources());
  console.log('Phase4: completing reassigned task');await store.assignTask(task,node.nodeId,1,'Recovered retry');await store.setTaskRunning(task,node.nodeId,2);
  await assert.rejects(()=>store.completeTask(task,node.nodeId,1,{operation:'prime_count',limit:10,count:4},1,resources()),error=>error.code==='STALE_TASK_RESULT');
  await store.completeTask(task,node.nodeId,2,{operation:'prime_count',limit:10,count:4},1,resources());
  const [history]=await store.pool.execute('SELECT status FROM task_attempts WHERE task_id=? ORDER BY attempt',[task]);assert.deepEqual(history.map(item=>item.status),['FAILED','COMPLETED']);
  const job=await store.createCompilationJob(admins[0].id,network.id,'python','integrity.py','print(1)');
  await store.completeCompilationJob(job.id,[{artifactType:'SOURCE',fileName:'integrity.py',mediaType:'text/x-python',bytes:Buffer.from('print(1)')}],{});
  const result=await store.getCompilationJob(job.id),artifact=result.artifacts[0];assert.ok(await store.getArtifact(artifact.id));
  await store.pool.execute('UPDATE artifacts SET content=? WHERE id=?',[Buffer.from('print(9)'),artifact.id]);assert.equal(await store.getArtifact(artifact.id),undefined);
  await store.pool.execute('UPDATE artifacts SET content=? WHERE id=?',[Buffer.from('print(1)'),artifact.id]);assert.ok(await store.getArtifact(artifact.id));
  const rollbackJob=await store.createCompilationJob(admins[0].id,network.id,'python','rollback.py','print(2)');
  const originalGet=store.pool.getConnection.bind(store.pool);
  store.pool.getConnection=async()=>{const connection=await originalGet(),execute=connection.execute;let inserts=0;connection.execute=async function(sql,...args){if(String(sql).startsWith('INSERT INTO artifacts')&&++inserts===2)throw new Error('Isolated publication interruption');return execute.call(this,sql,...args);};const release=connection.release;connection.release=function(){this.execute=execute;this.release=release;return release.call(this);};return connection;};
  try{await assert.rejects(()=>store.completeCompilationJob(rollbackJob.id,[{artifactType:'SOURCE',fileName:'rollback.py',mediaType:'text/plain',bytes:Buffer.from('print(2)')},{artifactType:'GENERATED_SOURCE',fileName:'compiled_rollback.py',mediaType:'text/plain',bytes:Buffer.from('print(2)')}],{}),/publication interruption/);}
  finally{store.pool.getConnection=originalGet;}
  const [rolledBack]=await store.pool.execute('SELECT id FROM artifacts WHERE job_id=?',[rollbackJob.id]);assert.equal(rolledBack.length,0);assert.equal((await store.getCompilationJob(rollbackJob.id)).status,'SUBMITTED');
  await networks.register(enroll.credential,profile);await store.heartbeat(node.nodeId,resources());
  const cancelJob=await store.createCompilationJob(admins[0].id,network.id,'python','outage-cancel.py','print(3)'),cancelTask=await store.createJobWorkTask(cancelJob.id,network.id,'PYTHON_COMPILE',{operation:'python_compile',source:'print(3)',sourceName:'outage-cancel.py'},'python');
  await store.assignTask(cancelTask.id,node.nodeId,1,'Cancellation during DB pause');await store.setTaskRunning(cancelTask.id,node.nodeId,1);
  console.log('Phase4: cancellation intersects actual MySQL pause');await fault('pauseMySQL');
  let settled=false;const cancellation=store.cancelCompilationJob(cancelJob.id,admins[0].id,false).then(value=>{settled=true;return value;});
  try{await pause(1200);assert.equal(settled,false,'Paused database cannot acknowledge a durable cancellation');}finally{await fault('resumeMySQL');}
  assert.equal((await cancellation).status,'CANCELLED');assert.equal((await store.getTask(cancelTask.id)).status,'CANCELLED');
  await assert.rejects(()=>store.completeTask(cancelTask.id,node.nodeId,1,{},1,resources()),error=>error.code==='STALE_TASK_RESULT');
  const [cancelHistory]=await store.pool.execute('SELECT status FROM task_attempts WHERE task_id=?',[cancelTask.id]);assert.equal(cancelHistory[0].status,'CANCELLED');
  // Server-caused interruptions are persisted independently from worker error text.
  await networks.register(enroll.credential,profile);await store.heartbeat(node.nodeId,resources());
  const serverTask=store.id('TASK');await store.pool.execute("INSERT INTO tasks(id,network_id,kind,payload_json,required_capability,status,created_at) VALUES(?,?,'TEST_COMPUTE',?,'base','QUEUED',?)",[serverTask,network.id,JSON.stringify({operation:'prime_count',limit:10}),store.now()]);
  await store.assignTask(serverTask,node.nodeId,1,'Server failure classification',10);await pause(30);await store.recoverTaskAttempts(false,true);
  const [serverHistory]=await store.pool.execute('SELECT failure_reason reason FROM task_attempts WHERE task_id=?',[serverTask]);assert.equal(serverHistory[0].reason,'SERVER_FAILURE');
  const login=await request('/api/auth/login',{identifier:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD});assert.equal(login.status,200);assert.ok(login.cookie);
  const nativeNetwork=await networks.create({name:'Phase4 real native portable catalogue',description:'',maxNodes:2,expiresAt:null},admins[0].id),nativeEnrollment=await networks.createEnrollment(nativeNetwork.joinToken,'NATIVE','phase4-native-catalogue',true);
  native=spawn(process.execPath,['--import','tsx',resolve('apps/worker/src/index.ts')],{cwd:process.cwd(),windowsHide:true,env:{...process.env,COORDINATOR_URL:target.base,WORKER_CREDENTIAL:nativeEnrollment.credential},stdio:['ignore','ignore','ignore']});
  await poll(()=>store.availableNodes(nativeNetwork.id),rows=>rows.length===1);
  for(const payload of [{operation:'matrix_multiply',left:[[1,2],[3,4]],right:[[5,6],[7,8]]},{operation:'portable_benchmark',seed:42,iterations:1000}]){
    const submitted=await request('/api/admin/tasks/test',{networkId:nativeNetwork.id,payload},login.cookie);assert.equal(submitted.status,201);
    const completed=await poll(()=>store.getTask(submitted.body.id),value=>['COMPLETED','FAILED'].includes(value?.status));assert.equal(completed.status,'COMPLETED');
    const [results]=await store.pool.execute('SELECT result_json result FROM results WHERE task_id=?',[completed.id]);assert.equal(results.length,1);const result=typeof results[0].result==='string'?JSON.parse(results[0].result):results[0].result;assert.equal(result.operation,payload.operation);
    if(payload.operation==='matrix_multiply')assert.deepEqual(result.matrix,[[19,22],[43,50]]);
  }
  // A busy compatible machine does not bypass an operation restriction at submission.
  assert.equal((await request(`/api/admin/networks/${nativeNetwork.id}/policy`,{allowedOperations:['prime_count']},login.cookie,'PATCH')).status,200);
  const nativeNodes=await store.availableNodes(nativeNetwork.id);await store.pool.execute("UPDATE nodes SET status='BUSY' WHERE id=?",[nativeNodes[0].id]);
  const email='phase4-policy@example.invalid',password='Phase4PolicyOnly!42';assert.equal((await request('/api/auth/signup',{name:'Phase4 Policy',email,password,confirmPassword:password})).status,201);
  const user=await request('/api/auth/login',{identifier:email,password});assert.equal(user.status,200);
  assert.equal((await request('/api/compilations',{language:'python',sourceName:'policy.py',source:'print(1)'},user.cookie)).status,409);
  await store.pool.execute("UPDATE nodes SET status='AVAILABLE' WHERE id=?",[nativeNodes[0].id]);
  assert.equal((await request(`/api/admin/networks/${nativeNetwork.id}/policy`,{},login.cookie,'PATCH')).status,200);
  const voluntaryNetwork=await networks.create({name:'Phase4 voluntary disconnect',description:'',maxNodes:1,expiresAt:null},admins[0].id),voluntaryEnrollment=await networks.createEnrollment(voluntaryNetwork.joinToken,'BROWSER','phase4-explicit-disconnect',true);
  logical=new WebSocket(target.base.replace(/^http/,'ws')+'/ws/worker',{headers:{Authorization:'Bearer '+voluntaryEnrollment.credential,Origin:process.env.PUBLIC_BASE_URL}});let logicalNode;
  logical.on('error',()=>{});logical.on('open',()=>logical.send(encodeProtocolMessage({type:'register',profile})));
  logical.on('message',raw=>{const message=parseCoordinatorMessage(JSON.parse(raw.toString()));if(message.type==='registered'){logicalNode=message.nodeId;logical.send(encodeProtocolMessage({type:'heartbeat',resources:resources()}));}else if(message.type==='task_assignment')logical.send(encodeProtocolMessage({type:'task_state',taskId:message.taskId,attempt:message.attempt,status:'RUNNING'}));});
  await poll(()=>store.availableNodes(voluntaryNetwork.id),rows=>rows.length===1);
  const voluntary=await request('/api/admin/tasks/test',{networkId:voluntaryNetwork.id,payload:{operation:'sha256_chain',input:'voluntary stop',iterations:10_000_000}},login.cookie);assert.equal(voluntary.status,201);
  await poll(()=>store.getTask(voluntary.body.id),value=>value?.status==='RUNNING');
  logical.send(encodeProtocolMessage({type:'disconnect'}));
  const [left]=await poll(async()=>{const [rows]=await store.pool.execute('SELECT failure_reason reason FROM task_attempts WHERE task_id=?',[voluntary.body.id]);return rows;},rows=>rows[0]?.reason==='USER_LEFT');assert.equal(left.reason,'USER_LEFT');
  const expired=store.id('TASK');await store.pool.execute("INSERT INTO tasks(id,network_id,kind,payload_json,required_capability,status,created_at,deadline_at) VALUES(?,?,'TEST_COMPUTE',?,'base','QUEUED',?,TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)))",[expired,network.id,JSON.stringify({operation:'prime_count',limit:10}),store.now()]);
  await store.expireQueuedTasks();assert.equal((await store.getTask(expired)).status,'FAILED');
  console.log('Phase4: restoring owned backup');await fault('backupRestoreMySQL');
  console.log(JSON.stringify({actualMySQLRestart:true,persistedBackoff:true,persistedDeadline:true,supersededResultRejected:true,attemptHistoryPreserved:true,artifactCorruptionRejected:true,publicationRollback:true,cancellationDuringMySQLPause:true,serverFailureClassification:true,nativeCatalogueExecution:true,busyPolicyEnforced:true,expiredAdmissionTerminal:true,isolatedBackupRestoreVerified:true}));
}finally{logical?.terminate();if(native&&native.exitCode===null&&native.signalCode===null){const stopped=once(native,'exit');native.kill();await stopped;}await store.close();if(process.connected)process.disconnect();}
