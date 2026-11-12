import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {encodeProtocolMessage,parseCoordinatorMessage} from '@omnicompile/contracts';
import {lowerCToIR} from '@omnicompile/compiler-c';
import {Store} from '../apps/coordinator/src/database.ts';
import {NetworkService} from '../apps/coordinator/src/networks.ts';
import {assertIsolatedTarget,verifyIsolatedCoordinator} from './Integration-Target.mjs';

const target=assertIsolatedTarget();await verifyIsolatedCoordinator(target);
const config={host:process.env.DB_HOST,port:Number(process.env.DB_PORT),name:target.database,user:process.env.DB_USER,password:process.env.DB_PASSWORD};
let store=await Store.connect(config);
const resources={cpuUtilizationPercent:1,freeMemoryBytes:2e9,memoryUtilizationPercent:50,observedAt:new Date().toISOString()};
const profile={workerType:'BROWSER',deviceType:'DESKTOP',cpuModel:'Cancellation fixture',logicalCores:2,totalMemoryBytes:4e9,operatingSystem:'Test',architecture:'browser',runtimes:{c:false,python:false,java:false},toolchains:{c:{available:false},python:{available:false},java:{available:false}},operations:{irOptimization:true,staticAnalysis:true,browserCompute:true,nativeCompilation:false}};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll(read,done,timeout=30000){const end=Date.now()+timeout;do{const value=await read();if(done(value))return value;await pause(60);}while(Date.now()<end);throw new Error('Cancellation fixture timed out');}
async function request(path,body,cookie,method=body?'POST':'GET'){const response=await fetch(target.base+path,{method,headers:{origin:process.env.PUBLIC_BASE_URL,...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,body:response.status===204?null:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
let native,logical;
try{
  const [admins]=await store.pool.query("SELECT id FROM users WHERE role='ADMIN' LIMIT 1"),owner=admins[0].id;
  const networks=new NetworkService(store.pool),network=await networks.create({name:'Cancellation fixture',description:'',maxNodes:5,expiresAt:null},owner);
  const enrollment=await networks.createEnrollment(network.joinToken,'BROWSER','cancel-device-001',true),node=await networks.register(enrollment.credential,profile);
  await store.heartbeat(node.nodeId,resources);
  const source='int main(void){return 0;}';
  const job=await store.createCompilationJob(owner,network.id,'c','cancel.c',source);
  const runningBatch=await store.createCOptimizationBatch(network.id,lowerCToIR(source),job.id);
  const task={id:runningBatch.tasks[0].taskId};
  await store.assignTask(task.id,node.nodeId,1,'Cancellation race',30000);await store.setTaskRunning(task.id,node.nodeId,1);
  const [before]=await store.pool.execute('SELECT lease_expires_at FROM task_attempts WHERE task_id=?',[task.id]);
  assert.equal(await store.cancelCompilationJob(job.id,'different-owner',false),undefined,'Foreign user must not cancel another job');
  assert.equal((await store.getTask(task.id)).status,'RUNNING');
  const cancelled=await store.cancelCompilationJob(job.id,owner,false);assert.equal(cancelled.status,'CANCELLED');assert.equal(cancelled.tasks[0].taskId,task.id);
  assert.equal((await store.getCompilationJob(job.id)).status,'CANCELLED');assert.equal((await store.getTask(task.id)).status,'CANCELLED');
  assert.equal(await store.heartbeat(node.nodeId,resources),false,'Cancelled executor must be quarantined until reconnect');
  await assert.rejects(()=>store.completeTask(task.id,node.nodeId,1,{},1,resources),error=>error.code==='STALE_TASK_RESULT');
  assert.equal(await store.failTask(task.id,node.nodeId,1,'Late failure'),false);
  await store.failOrRequeueNodeTasks(node.nodeId,'Late disconnect');await store.recoverTaskAttempts(true);
  await store.failCompilationJob(job.id,'Late compiler failure');await assert.rejects(()=>store.setJobStage(job.id,'CODE_GENERATING','ARTIFACT_GENERATION'));
  await store.attachFailureReports(job.id,[{artifactType:'BUILD_REPORT_JSON',fileName:'build-report.json',mediaType:'application/json',bytes:Buffer.from('{}')}],'Late failure report');
  await assert.rejects(()=>store.completeCompilationJob(job.id,[{artifactType:'GENERATED_SOURCE',fileName:'compiled_cancel.py',mediaType:'text/plain',bytes:Buffer.from('print(1)')}],{}));
  assert.equal((await store.getCompilationJob(job.id)).status,'CANCELLED');assert.equal((await store.getCompilationJob(job.id)).artifacts.length,0);
  const [history]=await store.pool.execute('SELECT status,lease_expires_at FROM task_attempts WHERE task_id=?',[task.id]);assert.equal(history[0].status,'CANCELLED');assert.equal(history[0].lease_expires_at.toISOString(),before[0].lease_expires_at.toISOString());
  assert.equal((await store.cancelCompilationJob(job.id,owner,false)).tasks.length,0,'Repeat cancellation must be idempotent');
  await assert.rejects(()=>store.createJobWorkTask(job.id,network.id,'PYTHON_COMPILE',{operation:'python_compile',source:'print(2)'},'python'),'Cancelled job must not receive late decomposition tasks');
  const queued=await store.createCompilationJob(owner,network.id,'python','queued.py','print(2)');await store.cancelCompilationJob(queued.id,owner,false);
  await assert.rejects(()=>store.attachJobBatch(queued.id,'missing-batch'),'Cancelled job must reject batch attachment');
  const finished=await store.createCompilationJob(owner,network.id,'python','finished.py','print(3)');await store.completeCompilationJob(finished.id,[{artifactType:'GENERATED_SOURCE',fileName:'compiled_finished.py',mediaType:'text/plain',bytes:Buffer.from('print(3)')}],{});
  assert.equal((await store.cancelCompilationJob(finished.id,owner,false)).status,'COMPLETED');
  // Both real transactions contend on the same owned job row. Whichever
  // commits first must determine the terminal outcome without mixed artifacts.
  for(let index=0;index<3;index++){
    const racing=await store.createCompilationJob(owner,network.id,'python',`race-${index}.py`,'print(4)');
    const blocker=await store.pool.getConnection();await blocker.beginTransaction();
    await blocker.execute('SELECT id FROM compilation_jobs WHERE id=? FOR UPDATE',[racing.id]);
    const cancel=store.cancelCompilationJob(racing.id,owner,false),publish=store.completeCompilationJob(racing.id,[{artifactType:'GENERATED_SOURCE',fileName:`compiled_race-${index}.py`,mediaType:'text/plain',bytes:Buffer.from('print(4)')}],{});
    const settled=Promise.allSettled([cancel,publish]);
    try{await pause(100);await blocker.commit();}finally{blocker.release();}
    const outcomes=await settled,current=await store.getCompilationJob(racing.id);
    assert.equal(outcomes[0].status,'fulfilled');
    if(current.status==='CANCELLED'){assert.equal(current.artifacts.length,0);assert.equal(outcomes[1].status,'rejected');}
    else{assert.equal(current.status,'COMPLETED');assert.equal(current.artifacts.length,1);assert.equal(outcomes[1].status,'fulfilled');assert.equal(outcomes[0].value.status,'COMPLETED');}
  }
  const batchJob=await store.createCompilationJob(owner,network.id,'c','batch.c','int main(void){return 0;}');
  const batch=await store.createCOptimizationBatch(network.id,lowerCToIR('int main(void){return 0;}'),batchJob.id);
  await store.cancelCompilationJob(batchJob.id,owner,false);assert.equal((await store.getCOptimizationBatch(batch.batchId)).status,'CANCELLED');assert.equal((await store.getTask(batch.tasks[0].taskId)).status,'CANCELLED');
  await assert.rejects(()=>store.createCOptimizationBatch(network.id,lowerCToIR('int main(void){return 0;}'),batchJob.id),'Cancellation before batch creation must not leave orphan queued tasks');
  await store.close();store=await Store.connect(config);assert.equal((await store.getCompilationJob(job.id)).status,'CANCELLED');assert.deepEqual(await store.recoverTaskAttempts(true),[]);
  console.log('PASS: owner-scoped cancellation, immutable attempts, restart persistence, stale result/failure guards and terminal publication/decomposition rejection.');
  const admin=(await request('/api/auth/login',{identifier:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD})).cookie;assert.ok(admin);
  assert.equal((await request(`/api/compilations/${job.id}/cancel`,null,null,'POST')).status,401);
  assert.equal((await request(`/api/compilations/${job.id}/cancel`,null,admin,'POST')).status,200);
  assert.equal((await request(`/api/compilations/${finished.id}/cancel`,null,admin,'POST')).status,409);
  const email='cancel-foreign@example.invalid',password='CancellationOnly!42';assert.equal((await request('/api/auth/signup',{name:'Foreign user',email,password,confirmPassword:password})).status,201);
  const foreign=(await request('/api/auth/login',{identifier:email,password})).cookie;
  assert.equal((await request(`/api/compilations/${job.id}/cancel`,null,foreign,'POST')).status,404);
  assert.equal((await request('/api/admin/tasks/missing/cancel',null,foreign,'POST')).status,403);

  const logicalNetwork=await new NetworkService(store.pool).create({name:'Logical cancel transport',description:'',maxNodes:3,expiresAt:null},owner);
  const logicalEnrollment=await request(`/api/join/${logicalNetwork.joinToken}/accept`,{consent:true,workerType:'BROWSER',deviceIdentity:'cancel-logical-browser'});
  logical=new WebSocket(target.base.replace(/^http/,'ws')+'/ws/worker',{headers:{Cookie:logicalEnrollment.cookie,Origin:process.env.PUBLIC_BASE_URL}});
  let logicalNode,assignment,cancelMessage,closed;
  logical.on('error',()=>{});logical.on('open',()=>logical.send(encodeProtocolMessage({type:'register',profile:{...profile,operations:{...profile.operations,taskCancellation:true}}})));
  logical.on('message',raw=>{const value=parseCoordinatorMessage(JSON.parse(raw.toString()));if(value.type==='registered'){logicalNode=value.nodeId;logical.send(encodeProtocolMessage({type:'heartbeat',resources}));}else if(value.type==='task_assignment'){assignment=value;logical.send(encodeProtocolMessage({type:'task_state',taskId:value.taskId,attempt:value.attempt,status:'RUNNING'}));}else if(value.type==='task_cancel')cancelMessage=value;});logical.on('close',code=>{closed=code;});
  await poll(()=>logicalNode,Boolean);
  const portable=await request('/api/admin/tasks/test',{networkId:logicalNetwork.id,payload:{operation:'sha256_chain',input:'hold',iterations:10_000_000}},admin);assert.equal(portable.status,201);
  await poll(()=>store.getTask(portable.body.id),task=>task?.status==='RUNNING');
  assert.equal((await request(`/api/admin/tasks/${portable.body.id}/cancel`,null,admin,'POST')).status,200);
  await poll(()=>cancelMessage,Boolean);await poll(()=>closed,Boolean);assert.equal(closed,1012);assert.equal(cancelMessage.taskId,assignment.taskId);assert.equal(cancelMessage.attempt,assignment.attempt);
  assert.equal((await store.getTask(portable.body.id)).status,'CANCELLED');
  console.log('PASS: authenticated API/RBAC and capability-negotiated WebSocket cancellation (logical browser client, not physical browser evidence).');

  const nativeNetwork=await new NetworkService(store.pool).create({name:'Real native cancel',description:'',maxNodes:2,expiresAt:null},owner);
  const nativeEnrollment=await request(`/api/join/${nativeNetwork.joinToken}/accept`,{consent:true,workerType:'NATIVE',deviceIdentity:'cancel-native-agent'});assert.equal(nativeEnrollment.status,201);
  let nativeLog='';native=spawn(process.execPath,['--import','tsx',resolve('apps/worker/src/index.ts')],{cwd:process.cwd(),windowsHide:true,env:{...process.env,COORDINATOR_URL:target.base,WORKER_CREDENTIAL:nativeEnrollment.body.workerCredential},stdio:['ignore','pipe','pipe']});native.stdout.on('data',chunk=>nativeLog+=chunk.toString());native.stderr.on('data',chunk=>nativeLog+=chunk.toString());
  const nativeNode=(await poll(()=>store.availableNodes(nativeNetwork.id),rows=>rows.length>0))[0].id;
  const work=await request('/api/admin/tasks/test',{networkId:nativeNetwork.id,payload:{operation:'sha256_chain',input:'real cancellation',iterations:10_000_000}},admin);
  await poll(()=>store.getTask(work.body.id),task=>task?.status==='RUNNING');
  assert.equal((await request(`/api/admin/tasks/${work.body.id}/cancel`,null,admin,'POST')).status,200);
  await poll(()=>store.availableNodes(nativeNetwork.id),rows=>rows.some(node=>node.id===nativeNode));
  assert.equal((await store.getTask(work.body.id)).status,'CANCELLED');
  const followup=await request('/api/admin/tasks/test',{networkId:nativeNetwork.id,payload:{operation:'prime_count',limit:10}},admin);await poll(()=>store.getTask(followup.body.id),task=>task?.status==='COMPLETED');
  const [answer]=await store.pool.execute('SELECT result_json FROM results WHERE task_id=?',[followup.body.id]);const result=typeof answer[0].result_json==='string'?JSON.parse(answer[0].result_json):answer[0].result_json;assert.equal(result.count,4);
  const [late]=await store.pool.execute('SELECT id FROM results WHERE task_id=?',[work.body.id]);assert.equal(late.length,0);assert.equal(native.exitCode,null,nativeLog);
  console.log('PASS: real Windows Node native worker cancellation, stable reconnect and independently verified follow-up task.');
}finally{logical?.terminate();if(native&&native.exitCode===null){native.kill();await Promise.race([new Promise(resolve=>native.once('exit',resolve)),pause(5000)]);}await store.close();}
