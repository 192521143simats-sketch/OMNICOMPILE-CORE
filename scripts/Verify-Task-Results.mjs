import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import WebSocket from 'ws';
import {encodeProtocolMessage,parseCoordinatorMessage} from '@omnicompile/contracts';
import {execute} from '../apps/worker/src/executor.ts';
import {Store} from '../apps/coordinator/src/database.ts';
import {NetworkService} from '../apps/coordinator/src/networks.ts';
import {assertIsolatedTarget,verifyIsolatedCoordinator} from './Integration-Target.mjs';

const target=assertIsolatedTarget();await verifyIsolatedCoordinator(target);
const origin=process.env.PUBLIC_BASE_URL;
const pool=mysql.createPool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),database:target.database,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(path,body,cookie){const response=await fetch(target.base+path,{method:body?'POST':'GET',headers:{origin,...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,body:response.status===204?null:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
async function poll(read,done){const end=Date.now()+20_000;let value;while(Date.now()<end){value=await read();if(done(value))return value;await pause(50);}throw new Error('Portable result verification state timed out; last fixture state: '+JSON.stringify(value));}
const resources=()=>({cpuUtilizationPercent:5,freeMemoryBytes:2_000_000_000,memoryUtilizationPercent:50,observedAt:new Date().toISOString()});
const profile={workerType:'BROWSER',deviceType:'DESKTOP',cpuModel:'Logical protocol fixture',logicalCores:2,totalMemoryBytes:4_000_000_000,operatingSystem:'Test only',architecture:'browser',runtimes:{c:false,python:false,java:false},toolchains:{c:{available:false},python:{available:false},java:{available:false}},operations:{irOptimization:true,staticAnalysis:true,browserCompute:true,nativeCompilation:false}};
const clients=[];
async function connect(network){
  const enrollment=await request(`/api${new URL(network.joinUrl).pathname}/accept`,{consent:true,workerType:'BROWSER',deviceIdentity:`result-fixture-${network.id}`});
  assert.equal(enrollment.status,201);
  const socket=new WebSocket(target.base.replace(/^http/,'ws')+'/ws/worker',{headers:{Cookie:enrollment.cookie,Origin:origin}});
  const client={socket,strategy:'valid',errors:[],assignments:[],latest:null};clients.push(client);
  socket.on('error',error=>{client.fatal=error;});
  socket.on('open',()=>socket.send(encodeProtocolMessage({type:'register',profile})));
  socket.on('message',raw=>{void (async()=>{
    const message=parseCoordinatorMessage(JSON.parse(raw.toString()));
    if(message.type==='registered'){client.nodeId=message.nodeId;socket.send(encodeProtocolMessage({type:'heartbeat',resources:resources()}));}
    else if(message.type==='error')client.errors.push(message);
    else if(message.type==='task_assignment'){
      client.assignments.push(message);client.latest=message;
      socket.send(encodeProtocolMessage({type:'task_state',taskId:message.taskId,attempt:message.attempt,status:'RUNNING'}));
      if(client.strategy==='hold')return;
      const execution=await execute(message.payload);
      if(client.strategy==='malformed')execution.result={...execution.result,verification:{status:'VERIFIED'}};
      if(client.strategy==='forge'||(client.strategy==='recover'&&message.attempt===1)){
        if(execution.result.operation==='prime_count')execution.result.count+=1;
        else execution.result.digest='0'.repeat(64);
      }
      socket.send(encodeProtocolMessage({type:'task_result',taskId:message.taskId,attempt:message.attempt,...execution,resources:resources()}));
    }
  })().catch(error=>{client.fatal=error;});});
  await poll(()=>client.nodeId,Boolean);
  client.timer=setInterval(()=>{if(socket.readyState===WebSocket.OPEN)socket.send(encodeProtocolMessage({type:'heartbeat',resources:resources()}));},1000);
  await poll(async()=>{const [rows]=await pool.execute('SELECT status FROM nodes WHERE id=?',[client.nodeId]);return rows[0]?.status;},status=>status==='AVAILABLE');
  return client;
}
let cookie;
async function submit(network,payload){const response=await request('/api/admin/tasks/test',{networkId:network.id,payload},cookie);assert.equal(response.status,201);return response.body.id;}
async function detail(id){const response=await request(`/api/admin/tasks/${id}`,undefined,cookie);assert.equal(response.status,200);return response.body;}
async function resultRows(id){const [rows]=await pool.execute('SELECT result_json result FROM results WHERE task_id=?',[id]);return rows.map(row=>typeof row.result==='string'?JSON.parse(row.result):row.result);}
try{
  const login=await request('/api/auth/login',{identifier:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD});assert.equal(login.status,200);cookie=login.cookie;
  const alphaResponse=await request('/api/admin/networks',{name:'Portable integrity Alpha',maxNodes:2},cookie),betaResponse=await request('/api/admin/networks',{name:'Portable integrity Beta',maxNodes:2},cookie);
  assert.equal(alphaResponse.status,201);assert.equal(betaResponse.status,201);
  const alpha=alphaResponse.body,beta=betaResponse.body,worker=await connect(alpha),foreign=await connect(beta);
  const payloads=[{operation:'sha256',input:'OMNICOMPILE: café 🔧'},{operation:'prime_count',limit:1000},{operation:'sha256_chain',input:'portable integrity',iterations:2500}];
  for(const payload of payloads){
    worker.strategy='forge';const id=await submit(alpha,payload);
    const rejected=await poll(()=>detail(id),task=>['FAILED','COMPLETED'].includes(task.status));
    assert.equal(rejected.status,'FAILED',`${payload.operation}: forged worker answer was accepted as completed`);
    assert.equal(rejected.attempts.length,3);assert.ok(rejected.attempts.every(attempt=>attempt.status==='FAILED'&&attempt.error.includes('verification')));
    assert.equal((await resultRows(id)).length,0,'Rejected computation created a result record');
    worker.strategy='valid';const validId=await submit(alpha,payload);
    await poll(()=>detail(validId),task=>task.status==='COMPLETED');
    const [result]=await resultRows(validId);assert.equal(result.verification.status,'VERIFIED');assert.equal(result.verification.method,'independent-recomputation');
    const expected=await execute(payload);for(const [key,value] of Object.entries(expected.result))assert.equal(result[key],value);
    // A duplicate completed attempt must not append another result or alter history.
    const packet={type:'task_result',taskId:validId,attempt:1,...expected,resources:resources()};
    worker.socket.send(encodeProtocolMessage(packet));foreign.socket.send(encodeProtocolMessage(packet));
    await poll(()=>worker.errors,errors=>errors.some(error=>error.code==='STALE_TASK_RESULT'));
    await poll(()=>foreign.errors,errors=>errors.some(error=>error.code==='STALE_TASK_RESULT'));
    assert.equal((await resultRows(validId)).length,1);assert.equal((await detail(validId)).attempts.length,1);
  }
  worker.strategy='recover';const recoveredId=await submit(alpha,{operation:'prime_count',limit:100});
  const recovered=await poll(()=>detail(recoveredId),task=>task.status==='COMPLETED');
  assert.deepEqual(recovered.attempts.map(attempt=>attempt.status),['FAILED','COMPLETED']);assert.equal((await resultRows(recoveredId)).length,1);
  worker.strategy='malformed';const malformedId=await submit(alpha,{operation:'prime_count',limit:10});
  const malformed=await poll(()=>detail(malformedId),task=>['FAILED','COMPLETED'].includes(task.status));assert.equal(malformed.status,'FAILED');assert.equal((await resultRows(malformedId)).length,0);

  // An active attempt cannot be completed by a different network or old attempt.
  worker.strategy='hold';const scopedId=await submit(alpha,{operation:'prime_count',limit:100});
  await poll(()=>detail(scopedId),task=>task.status==='RUNNING');
  const scopedExecution=await execute({operation:'prime_count',limit:100});
  const scopedPacket={type:'task_result',taskId:scopedId,attempt:1,...scopedExecution,resources:resources()};
  const foreignErrors=foreign.errors.length,workerErrors=worker.errors.length;
  foreign.socket.send(encodeProtocolMessage(scopedPacket));worker.socket.send(encodeProtocolMessage({...scopedPacket,attempt:2}));
  await poll(()=>foreign.errors,errors=>errors.length>foreignErrors);await poll(()=>worker.errors,errors=>errors.length>workerErrors);
  assert.equal(foreign.errors.at(-1).code,'STALE_TASK_RESULT');assert.equal(worker.errors.at(-1).code,'STALE_TASK_RESULT');
  assert.equal((await detail(scopedId)).status,'RUNNING');assert.equal((await resultRows(scopedId)).length,0);
  worker.socket.send(encodeProtocolMessage(scopedPacket));await poll(()=>detail(scopedId),task=>task.status==='COMPLETED');

  // Concurrent duplicate submissions during a costly verification publish once,
  // and a heartbeat sent after the result is handled before verification ends.
  const longPayload={operation:'sha256_chain',input:'responsive verification',iterations:500_000};
  const longExecution=await execute(longPayload),longId=await submit(alpha,longPayload);
  await poll(()=>detail(longId),task=>task.status==='RUNNING');
  const longPacket={type:'task_result',taskId:longId,attempt:1,...longExecution,resources:resources()};
  const errorsBefore=worker.errors.length;
  clearInterval(worker.timer); // Do not overwrite the acknowledgement probe.
  worker.socket.send(encodeProtocolMessage(longPacket));worker.socket.send(encodeProtocolMessage(longPacket));
  const marker=resources();marker.observedAt='2026-10-13T00:00:00.123Z';
  worker.socket.send(encodeProtocolMessage({type:'heartbeat',resources:marker}));
  await poll(async()=>{const [rows]=await pool.execute('SELECT resource_json resources FROM nodes WHERE id=?',[worker.nodeId]);return rows[0]?.resources;},value=>(typeof value==='string'?JSON.parse(value):value)?.observedAt===marker.observedAt);
  assert.equal((await detail(longId)).status,'RUNNING','Verification blocked the ordered socket heartbeat queue');
  await poll(()=>detail(longId),task=>task.status==='COMPLETED');await poll(()=>worker.errors,errors=>errors.length>errorsBefore);
  assert.equal((await resultRows(longId)).length,1);
  worker.timer=setInterval(()=>worker.socket.send(encodeProtocolMessage({type:'heartbeat',resources:resources()})),1000);

  // Force a real MySQL insert failure after the completion UPDATE. The entire
  // existing transaction must roll back, including node/attempt state.
  const rollbackId=await submit(alpha,{operation:'prime_count',limit:100});
  await poll(()=>detail(rollbackId),task=>task.status==='RUNNING');
  const store=await Store.connect({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),name:target.database,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
  let checkAdded=false;
  try{
    assert.match(rollbackId,/^TASK-[a-f0-9-]+$/);
    // An isolated CHECK needs no SUPER privilege or server setting changes.
    await pool.query(`ALTER TABLE results ADD CONSTRAINT engineering_reject_result CHECK (task_id <> '${rollbackId}')`);checkAdded=true;
    await assert.rejects(()=>store.completeTask(rollbackId,worker.nodeId,1,scopedExecution.result,scopedExecution.executionTimeMs,resources()),/engineering_reject_result/);
    assert.equal((await detail(rollbackId)).status,'RUNNING');assert.equal((await detail(rollbackId)).attempts[0].status,'RUNNING');assert.equal((await resultRows(rollbackId)).length,0);
    const [nodes]=await pool.execute('SELECT status,current_task_id FROM nodes WHERE id=?',[worker.nodeId]);assert.equal(nodes[0].status,'BUSY');assert.equal(nodes[0].current_task_id,rollbackId);
    await pool.query('ALTER TABLE results DROP CHECK engineering_reject_result');checkAdded=false;
    await store.completeTask(rollbackId,worker.nodeId,1,scopedExecution.result,scopedExecution.executionTimeMs,resources());assert.equal((await detail(rollbackId)).status,'COMPLETED');

    // Control the real database query boundary, not a fake node state: return
    // the old heartbeat read only after a genuine completion has committed.
    const heartbeatId=await submit(alpha,{operation:'prime_count',limit:100});
    await poll(()=>detail(heartbeatId),task=>task.status==='RUNNING');
    const heartbeatStore=await Store.connect({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),name:target.database,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
    const originalExecute=heartbeatStore.pool.execute.bind(heartbeatStore.pool);let completed=false;
    const finishBeforeHeartbeatWrite=async()=>{if(completed)return;await store.completeTask(heartbeatId,worker.nodeId,1,scopedExecution.result,scopedExecution.executionTimeMs,resources());completed=true;};
    heartbeatStore.pool.execute=async function(sql,params){
      if(sql.startsWith('SELECT status FROM nodes')){const rows=await originalExecute(sql,params);await finishBeforeHeartbeatWrite();return rows;}
      if(sql.startsWith('UPDATE nodes'))await finishBeforeHeartbeatWrite();
      return originalExecute(sql,params);
    };
    try{
      assert.equal(await heartbeatStore.heartbeat(worker.nodeId,resources()),true);
      const [state]=await pool.execute('SELECT status,current_task_id FROM nodes WHERE id=?',[worker.nodeId]);
      assert.equal(state[0].status,'AVAILABLE','Heartbeat restored cached BUSY after actual completion');assert.equal(state[0].current_task_id,null);
    }finally{heartbeatStore.pool.execute=originalExecute;await heartbeatStore.close();}

    // Two real enrolled/registered fixture nodes, deliberately not in the
    // coordinator socket map so scheduler ticks cannot alter this interleaving.
    const overlapNetwork=await request('/api/admin/networks',{name:'Verification overlap fixture',maxNodes:2},cookie);assert.equal(overlapNetwork.status,201);
    const networkService=new NetworkService(store.pool),identities=[];
    for(let index=0;index<2;index++){
      const admitted=await request(`/api${new URL(overlapNetwork.body.joinUrl).pathname}/accept`,{consent:true,workerType:'BROWSER',deviceIdentity:`overlap-fixture-${index}`});assert.equal(admitted.status,201);
      const registered=await networkService.register(admitted.cookie.slice(admitted.cookie.indexOf('=')+1),profile);assert.ok(registered);identities.push(registered.nodeId);
      await store.heartbeat(registered.nodeId,resources());
    }
    const overlapId=store.id('TASK');
    await pool.execute("INSERT INTO tasks(id,session_id,network_id,kind,payload_json,required_capability,status,created_at) VALUES(?,NULL,?,'TEST_COMPUTE',?,'base','QUEUED',?)",[overlapId,overlapNetwork.body.id,JSON.stringify(longPayload),store.now()]);
    await store.assignTask(overlapId,identities[0],1,'isolated overlap fixture');await store.setTaskRunning(overlapId,identities[0],1);
    const oldResult=store.completeTask(overlapId,identities[0],1,longExecution.result,longExecution.executionTimeMs,resources()).then(()=>null,error=>error);
    await pause(40);await store.failOrRequeueNodeTasks(identities[0],'Fixture disconnected during recomputation');await store.markDisconnected(identities[0]);
    await poll(async()=>{const [rows]=await store.pool.execute('SELECT next_eligible_at<=UTC_TIMESTAMP(3) eligible FROM tasks WHERE id=?',[overlapId]);return Boolean(rows[0]?.eligible);},Boolean);
    await store.assignTask(overlapId,identities[1],1,'isolated retry fixture');await store.setTaskRunning(overlapId,identities[1],2);
    try{await store.completeTask(overlapId,identities[1],2,longExecution.result,longExecution.executionTimeMs,resources());}
    finally{const stale=await oldResult;assert.equal(stale?.code,'STALE_TASK_RESULT');}
    assert.deepEqual((await detail(overlapId)).attempts.map(attempt=>attempt.status),['INTERRUPTED','COMPLETED']);assert.equal((await resultRows(overlapId)).length,1);
  }finally{if(checkAdded)await pool.query('ALTER TABLE results DROP CHECK engineering_reject_result');await store.close();}

  // Revocation while recomputation is in flight invalidates publication even
  // though the answer itself is correct. This is not a physical device test.
  const revokeId=await submit(alpha,longPayload);await poll(()=>detail(revokeId),task=>task.status==='RUNNING');
  clearInterval(worker.timer);
  worker.socket.send(encodeProtocolMessage({...longPacket,taskId:revokeId}));
  const revokeMarker=resources();revokeMarker.observedAt='2026-10-13T00:00:00.456Z';
  worker.socket.send(encodeProtocolMessage({type:'heartbeat',resources:revokeMarker}));
  await poll(async()=>{const [rows]=await pool.execute('SELECT resource_json resources FROM nodes WHERE id=?',[worker.nodeId]);return rows[0]?.resources;},value=>(typeof value==='string'?JSON.parse(value):value)?.observedAt===revokeMarker.observedAt);
  assert.equal((await detail(revokeId)).status,'RUNNING');
  const revoked=await request(`/api/admin/nodes/${worker.nodeId}/revoke`,{},cookie);assert.equal(revoked.status,204);
  await poll(()=>detail(revokeId),task=>task.attempts[0]?.status==='INTERRUPTED');
  await pause(2500);assert.equal((await resultRows(revokeId)).length,0,'Revoked worker result was committed after verification');
  assert.equal((await detail(revokeId)).attempts[0].status,'INTERRUPTED');
  assert.equal(foreign.assignments.length,0,'Network Beta received Network Alpha work');
  const [audits]=await pool.execute("SELECT event_type FROM audit_events WHERE event_type IN ('TASK_RESULT_VERIFIED','TASK_RESULT_REJECTED')");
  assert.ok(audits.filter(row=>row.event_type==='TASK_RESULT_REJECTED').length>=10);assert.ok(audits.filter(row=>row.event_type==='TASK_RESULT_VERIFIED').length>=4);
  await verifyIsolatedCoordinator(target);
  console.log(JSON.stringify({independentPortableResults:'passed',operations:payloads.map(payload=>payload.operation),forgedResults:'rejected without result records',retryHistory:'three terminal failures and successful recovery verified',replayAndNetworkScope:'enforced including active attempts',concurrentReplay:'one publication',heartbeatDuringVerification:'processed while still RUNNING',heartbeatCompletionRace:'idle node remains AVAILABLE',overlappingRetry:'new authorized attempt completes while old verification becomes stale',revocationDuringVerification:'no publication',actualMySQLRollback:'task, attempt, result and node effects atomic',audit:'persisted',client:'logical protocol fixture executing the real native worker portable executor; not a device/browser acceptance test'}));
}finally{for(const client of clients){clearInterval(client.timer);client.socket.terminate();}await pool.end();}
