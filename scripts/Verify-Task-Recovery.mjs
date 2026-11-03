import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import WebSocket from 'ws';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {encodeProtocolMessage,parseCoordinatorMessage} from '@omnicompile/contracts';
import {execute} from '../apps/worker/src/executor.ts';
import {lowerCToIR} from '@omnicompile/compiler-c';
import {Store} from '../apps/coordinator/src/database.ts';
import {assertIsolatedTarget,verifyIsolatedCoordinator} from './Integration-Target.mjs';

const target=assertIsolatedTarget();await verifyIsolatedCoordinator(target);
if(!process.send)throw new Error('Recovery faults require the owning isolated runner IPC.');
const pending=new Map();let serial=0;
process.on('message',message=>{const item=pending.get(message.id);if(item){pending.delete(message.id);message.error?item.reject(new Error(message.error)):item.resolve();}});
function fault(action){return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});process.send({id,recoveryAction:action});});}
const pool=mysql.createPool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),database:target.database,user:process.env.DB_USER,password:process.env.DB_PASSWORD,timezone:'Z'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll(read,done,timeout=20000){const end=Date.now()+timeout;let value;do{value=await read();if(done(value))return value;await pause(60);}while(Date.now()<end);throw new Error('Recovery fixture timed out: '+JSON.stringify(value));}
const resources=()=>({cpuUtilizationPercent:1,freeMemoryBytes:2e9,memoryUtilizationPercent:50,observedAt:new Date().toISOString()});
const profile={workerType:'BROWSER',deviceType:'DESKTOP',cpuModel:'Recovery logical fixture',logicalCores:2,totalMemoryBytes:4e9,operatingSystem:'Test only',architecture:'browser',runtimes:{c:false,python:false,java:false},toolchains:{c:{available:false},python:{available:false},java:{available:false}},operations:{irOptimization:true,staticAnalysis:true,browserCompute:true,nativeCompilation:false}};
let cookie,native;const clients=[];
async function request(path,body,credential=cookie){const response=await fetch(target.base+path,{method:body?'POST':'GET',headers:{origin:process.env.PUBLIC_BASE_URL,...(credential?{cookie:credential}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const value=response.status===204?null:await response.json();assert.ok(response.ok,JSON.stringify(value));return{body:value,cookie:response.headers.get('set-cookie')?.split(';')[0]};}
async function network(name){return(await request('/api/admin/networks',{name,maxNodes:4})).body;}
async function connect(network,strategy='hold',credential){
  if(!credential)credential=(await request(`/api${new URL(network.joinUrl).pathname}/accept`,{consent:true,workerType:'BROWSER',deviceIdentity:`recovery-${network.id}-${clients.length}`})).cookie;
  const socket=new WebSocket(target.base.replace(/^http/,'ws')+'/ws/worker',{headers:{Cookie:credential,Origin:process.env.PUBLIC_BASE_URL}}),client={socket,credential,errors:[],assignments:[],strategy};clients.push(client);
  socket.on('error',()=>{});socket.on('open',()=>socket.send(encodeProtocolMessage({type:'register',profile})));
  socket.on('message',raw=>{void(async()=>{const message=parseCoordinatorMessage(JSON.parse(raw.toString()));
    if(message.type==='registered'){client.nodeId=message.nodeId;socket.send(encodeProtocolMessage({type:'heartbeat',resources:resources()}));}
    else if(message.type==='error')client.errors.push(message);
    else if(message.type==='task_assignment'){client.assignments.push(message);socket.send(encodeProtocolMessage({type:'task_state',taskId:message.taskId,attempt:message.attempt,status:'RUNNING'}));if(client.strategy==='valid'){const answer=await execute(message.payload);socket.send(encodeProtocolMessage({type:'task_result',taskId:message.taskId,attempt:message.attempt,...answer,resources:resources()}));}}
  })().catch(error=>{client.failure=error.message;});});
  await poll(()=>client.nodeId,Boolean);client.timer=setInterval(()=>{if(socket.readyState===WebSocket.OPEN)socket.send(encodeProtocolMessage({type:'heartbeat',resources:resources()}));},1000);return client;
}
async function submit(network){return(await request('/api/admin/tasks/test',{networkId:network.id,payload:{operation:'prime_count',limit:100}})).body.id;}
async function detail(id){return(await request(`/api/admin/tasks/${id}`)).body;}
async function running(id){return poll(()=>detail(id),value=>value.status==='RUNNING');}
async function complete(id){return poll(()=>detail(id),value=>value.status==='COMPLETED');}
try{
  const login=await request('/api/auth/login',{identifier:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD},null);cookie=login.cookie;
  const alpha=await network('Restart recovery'),worker=await connect(alpha),id=await submit(alpha),before=await running(id);
  assert.ok(before.attempts[0].leaseExpiresAt,'Assignment must expose its persisted deadline');
  await fault('restartCoordinator');
  const restarted=await detail(id);
  assert.equal(restarted.status,'REQUEUED','Restart must recover immediately, not wait for an erased timeout or stale heartbeat');
  assert.equal(restarted.attempts[0].status,'INTERRUPTED');assert.equal(restarted.attempts[0].leaseExpiresAt,before.attempts[0].leaseExpiresAt);
  const replacement=await connect(alpha,'valid');const finished=await complete(id);assert.deepEqual(finished.attempts.map(row=>row.status),['INTERRUPTED','COMPLETED']);assert.notEqual(finished.attempts[0].nodeId,finished.attempts[1].nodeId);

  const beta=await network('Database outage recovery'),outageWorker=await connect(beta),outageId=await submit(beta);await running(outageId);
  await fault('pauseMySQL');
  try{const response=await fetch(target.base+'/ready',{signal:AbortSignal.timeout(8000)});assert.equal(response.status,503,'Unavailable MySQL must not report ready');await pause(1500);}
  finally{await fault('resumeMySQL');}
  await verifyIsolatedCoordinator(target);
  const expired=await poll(()=>detail(outageId),value=>value.attempts[0]?.status==='TIMED_OUT');assert.equal(expired.status,'REQUEUED');assert.ok(expired.attempts[0].error.includes('lease'));
  await poll(()=>outageWorker.socket.readyState,state=>state===WebSocket.CLOSED);
  await connect(beta,'valid');assert.deepEqual((await complete(outageId)).attempts.map(row=>row.status),['TIMED_OUT','COMPLETED']);

  const gamma=await network('Disconnect recovery'),disconnected=await connect(gamma),disconnectId=await submit(gamma);await running(disconnectId);disconnected.socket.terminate();
  await poll(()=>detail(disconnectId),value=>value.attempts[0]?.status==='INTERRUPTED');await connect(gamma,'valid');assert.deepEqual((await complete(disconnectId)).attempts.map(row=>row.status),['INTERRUPTED','COMPLETED']);
  const [results]=await pool.execute('SELECT task_id,COUNT(*) count FROM results WHERE task_id IN (?,?,?) GROUP BY task_id',[id,outageId,disconnectId]);assert.equal(results.length,3);assert.ok(results.every(row=>Number(row.count)===1));
  const delta=await network('Disconnect during MySQL outage'),lost=await connect(delta),lostId=await submit(delta);await running(lostId);
  // This case deliberately blocks the disconnect UPDATE behind a held node row.
  // Stop this fixture's unrelated periodic sender before taking that lock;
  // otherwise an incidental heartbeat can own the serialized socket queue first,
  // and the test waits for an UPDATE it has itself prevented from starting.
  // Other cases above exercise actual heartbeats during database interruption.
  clearInterval(lost.timer);await pause(200);
  const closeBlocker=await pool.getConnection();await closeBlocker.beginTransaction();await closeBlocker.execute('SELECT id FROM nodes WHERE id=? FOR UPDATE',[lost.nodeId]);
  let renewedClient;
  try{
    await fault('pauseMySQL');
    lost.socket.terminate();await pause(800);
    // Start reconnect while old disconnect cleanup is waiting on the real DB.
    const renewed=connect(delta,'valid',lost.credential);renewed.catch(()=>{});
    await pause(800);await fault('resumeMySQL');
    await poll(async()=>{const [rows]=await pool.query('SHOW FULL PROCESSLIST');return rows.some(row=>row.db===target.database&&String(row.Info).includes('UPDATE task_attempts a JOIN tasks t'));},Boolean);
    await pause(200);await closeBlocker.rollback();
    renewedClient=await renewed;assert.equal(renewedClient.nodeId,lost.nodeId);
  }finally{await closeBlocker.rollback().catch(()=>{});closeBlocker.release();}
  const recoveredDisconnect=await complete(lostId);assert.deepEqual(recoveredDisconnect.attempts.map(row=>row.status),['INTERRUPTED','COMPLETED']);
  assert.equal(recoveredDisconnect.attempts[1].nodeId,lost.nodeId);
  assert.ok(clients.every(client=>!client.failure),JSON.stringify(clients.map(client=>client.failure)));
  await fault('restartCoordinator');assert.equal((await detail(id)).status,'COMPLETED');assert.equal((await detail(outageId)).status,'COMPLETED');await verifyIsolatedCoordinator(target);
  const nativeNetwork=await network('Actual native busy reconnect');
  const nativeEnrollment=(await request(`/api${new URL(nativeNetwork.joinUrl).pathname}/accept`,{consent:true,workerType:'NATIVE',deviceIdentity:'native-recovery-fixture'})).body;
  let nativeLog='';native=spawn(process.execPath,['--import','tsx',resolve('apps/worker/src/index.ts')],{cwd:process.cwd(),env:{...process.env,COORDINATOR_URL:target.base,WORKER_CREDENTIAL:nativeEnrollment.workerCredential},windowsHide:true,stdio:['ignore','pipe','pipe']});native.stdout.on('data',chunk=>{nativeLog+=chunk.toString();});native.stderr.on('data',chunk=>{nativeLog+=chunk.toString();});
  await poll(async()=>{const response=await request('/api/admin/nodes?page=1&pageSize=100');return response.body.items;},items=>items.some(item=>item.networkId===nativeNetwork.id&&item.status==='AVAILABLE'),30000);
  const longId=(await request('/api/admin/tasks/test',{networkId:nativeNetwork.id,payload:{operation:'sha256_chain',input:'real native reconnect',iterations:10000000}})).body.id;
  const originalNative=await running(longId);await fault('restartCoordinator');
  // Updated workers abort owned execution on socket loss. A subsequent attempt
  // is legitimate only after termination; the old attempt cannot publish.
  const retriedNative=await poll(()=>detail(longId),state=>state.attempt===2&&state.status==='RUNNING',30000);
  assert.equal(retriedNative.attempts[0].status,'INTERRUPTED');assert.equal(retriedNative.attempts[0].leaseExpiresAt,originalNative.attempts[0].leaseExpiresAt);
  assert.ok(!retriedNative.attempts.some(item=>item.error?.includes('already busy')));
  await request(`/api/admin/tasks/${longId}/cancel`,{});assert.equal((await detail(longId)).status,'CANCELLED');
  const [cancelledNativeResults]=await pool.execute('SELECT id FROM results WHERE task_id=?',[longId]);assert.equal(cancelledNativeResults.length,0);
  assert.ok(!nativeLog.includes(`Completed ${longId}`),'Cancelled native work must not advertise successful completion');
  const nativeFollowup=await submit(nativeNetwork);await complete(nativeFollowup);
  native.kill();await request(`/api/admin/networks/${nativeNetwork.id}/disable`,{});
  // Real compilation result durably stored before process death, but no final
  // artifact transaction yet. Recovery must finish from that persisted result.
  const store=await Store.connect({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),name:target.database,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
  try{
    const [admins]=await pool.query("SELECT id FROM users WHERE role='ADMIN' LIMIT 1");
    const source='total = 2 + 3\nprint(total)\n',job=await store.createCompilationJob(admins[0].id,alpha.id,'python','recovery.py',source),task=await store.createJobWorkTask(job.id,alpha.id,'PYTHON_COMPILE',{operation:'python_compile',sourceName:'recovery.py',source},'python');
    const computed=await execute(task.payload);
    // Fixture simulates the exact durable post-task/pre-finalization boundary;
    // bytes come from actual CPython, never fabricated compiler output.
    await pool.execute("UPDATE tasks SET status='COMPLETED',attempt=1,assigned_node_id=? WHERE id=?",[replacement.nodeId,task.id]);
    await pool.execute("INSERT INTO task_attempts(task_id,attempt,node_id,status,scheduler_score,scheduler_explanation,assigned_at,completed_at,lease_expires_at) VALUES(?,1,?,'COMPLETED',1,'Owned crash-boundary fixture',?,?,UTC_TIMESTAMP(3))",[task.id,replacement.nodeId,store.now(),store.now()]);
    await pool.execute('INSERT INTO results(id,task_id,node_id,attempt,result_json,execution_time_ms,resource_json,created_at) VALUES(?,?,?,1,?,?,?,?)',[store.id('RESULT'),task.id,replacement.nodeId,JSON.stringify(computed.result),computed.executionTimeMs,JSON.stringify(resources()),store.now()]);
    await store.setJobStage(job.id,'DISTRIBUTING','DISTRIBUTED_COMPILATION');
    await fault('restartCoordinator');
    const restored=await poll(()=>store.getCompilationJob(job.id),value=>['COMPLETED','FAILED'].includes(value.status));
    assert.equal(restored.status,'COMPLETED','Persisted compiler result must not leave its job stranded after restart');assert.ok(restored.artifacts.some(item=>item.artifactType==='BYTECODE'));assert.ok(restored.artifacts.some(item=>item.artifactType==='BUILD_REPORT_JSON'));
  }finally{await store.close();}
  const cStore=await Store.connect({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),name:target.database,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
  try{
    const [admins]=await pool.query("SELECT id FROM users WHERE role='ADMIN' LIMIT 1"),source='int main(void){int total=2+3;return total-5;}';
    const job=await cStore.createCompilationJob(admins[0].id,alpha.id,'c','recovery.c',source),ir=lowerCToIR(source),batch=await cStore.createCOptimizationBatch(alpha.id,ir);await cStore.attachJobBatch(job.id,batch.batchId);
    const blocker=await pool.getConnection();await blocker.beginTransaction();await blocker.execute('SELECT id FROM compilation_jobs WHERE id=? FOR UPDATE',[job.id]);
    try{
      for(let i=0;i<batch.tasks.length;i++){
        const task=batch.tasks[i],answer=await execute({operation:'c_optimize_ir',function:ir.functions[i]});
        await pool.execute("UPDATE tasks SET status='COMPLETED',assigned_node_id=?,attempt=1 WHERE id=?",[replacement.nodeId,task.taskId]);
        await pool.execute("INSERT INTO task_attempts(task_id,attempt,node_id,status,scheduler_score,scheduler_explanation,assigned_at,completed_at,lease_expires_at) VALUES(?,1,?,'COMPLETED',1,'Owned C publication fixture',?,?,UTC_TIMESTAMP(3))",[task.taskId,replacement.nodeId,cStore.now(),cStore.now()]);
        await pool.execute('INSERT INTO results(id,task_id,node_id,attempt,result_json,execution_time_ms,resource_json,created_at) VALUES(?,?,?,1,?,?,?,?)',[cStore.id('RESULT'),task.taskId,replacement.nodeId,JSON.stringify(answer.result),answer.executionTimeMs,JSON.stringify(resources()),cStore.now()]);
      }
      const blocked=await poll(async()=>{const [rows]=await pool.query('SHOW FULL PROCESSLIST');return rows.find(row=>row.db===target.database&&String(row.Info).includes("UPDATE compilation_jobs SET status='CODE_GENERATING'")&&String(row.Info).includes(job.id));},Boolean);
      assert.ok(Number.isSafeInteger(Number(blocked.Id)));await pool.query(`KILL CONNECTION ${Number(blocked.Id)}`);
      await blocker.rollback();
    }finally{await blocker.rollback().catch(()=>{});blocker.release();}
    const restored=await poll(()=>cStore.getCompilationJob(job.id),value=>['COMPLETED','FAILED'].includes(value.status),30000);
    assert.equal(restored.status,'COMPLETED','Transient MySQL connection loss during C publication must retry, not report compiler failure');assert.ok(restored.artifacts.some(item=>item.artifactType==='EXECUTABLE'));
  }finally{await cStore.close();}
  console.log(JSON.stringify({actualCoordinatorCrashRestart:true,immediateInterruptedRecovery:true,deadlinesPreserved:true,actualMySQLPauseAndResume:true,unavailableReadiness503:true,expiredLeaseAfterOutage:true,coordinatorRemainedAlive:true,workerDisconnect:true,disconnectDuringDatabaseOutage:true,differentWorkerReassignment:true,singleVerifiedResultPerTask:true,completedHistorySurvivesRestart:true,actualNativeExecutorBusyReconnect:true,persistedPythonResultPublicationAfterCrash:true,cPublicationAfterActualDatabaseConnectionLoss:true,workers:'logical WebSocket fixtures plus actual native Node worker process; not installer/physical-device acceptance'}));
}finally{if(native&&native.exitCode===null)native.kill();for(const client of clients){clearInterval(client.timer);client.socket.terminate();}await pool.end();if(process.connected)process.disconnect();}
