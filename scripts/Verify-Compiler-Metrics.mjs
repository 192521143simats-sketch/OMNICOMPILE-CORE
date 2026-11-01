import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import WebSocket from 'ws';
import {encodeProtocolMessage,parseCoordinatorMessage} from '@c-optiforge/contracts';
import {execute} from '../apps/worker/src/executor.ts';
import {Store} from '../apps/coordinator/src/database.ts';
import {NetworkService} from '../apps/coordinator/src/networks.ts';
import {assertIsolatedTarget,verifyIsolatedCoordinator} from './Integration-Target.mjs';

const target=assertIsolatedTarget();await verifyIsolatedCoordinator(target);
const origin=process.env.PUBLIC_BASE_URL;
const store=await Store.connect({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),name:target.database,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
const networks=new NetworkService(store.pool),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(path,body,cookie){const response=await fetch(target.base+path,{method:body===undefined?'GET':'POST',signal:AbortSignal.timeout(15000),headers:{origin,...(cookie?{cookie}:{}),...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:response.status,body:response.status===204?null:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
async function poll(read,done,label){const end=Date.now()+30000;let value;while(Date.now()<end){value=await read();if(done(value))return value;await pause(350);}throw new Error(`Metrics fixture timed out: ${label}; last=${JSON.stringify(value)}`);}
const profile={workerType:'BROWSER',deviceType:'DESKTOP',cpuModel:'Logical WebSocket protocol fixture — not physical browser evidence',logicalCores:2,totalMemoryBytes:4e9,operatingSystem:'Test fixture',architecture:'browser',runtimes:{c:false,python:false,java:false},toolchains:{c:{available:false},python:{available:false},java:{available:false}},operations:{irOptimization:true,staticAnalysis:true,browserCompute:true,nativeCompilation:false}};
const resources=()=>({cpuUtilizationPercent:0,cpuMeasurementAvailable:false,freeMemoryBytes:2e9,memoryUtilizationPercent:0,memoryMeasurementAvailable:false,observedAt:new Date().toISOString()});
let socket,timer,nodeId,lastResult,fatal;
try{
 const admin=await request('/api/auth/login',{identifier:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD});assert.equal(admin.status,200);
 assert.equal((await request('/api/user/compiler-metrics')).status,401);
 assert.equal((await request('/api/user/compiler-metrics',undefined,admin.cookie)).status,403,'administrators have no user-job metrics');
 const users=[];
 for(const suffix of ['alpha','beta']){
  const email=`metrics-${suffix}-${target.instance}@example.org`,password='MetricsFixtureOnly!42';
  const signup=await request('/api/auth/signup',{name:`Metrics ${suffix}`,email,password,confirmPassword:password});assert.equal(signup.status,201);
  const login=await request('/api/auth/login',{identifier:email,password});assert.equal(login.status,200);users.push({id:login.body.user.id,cookie:login.cookie});
 }
 const [alpha,beta]=users;
 const empty=await request('/api/user/compiler-metrics',undefined,alpha.cookie);assert.equal(empty.status,200);assert.equal(empty.body.scope,'OWN_JOBS');assert.equal(empty.body.tasks.successRate,null);assert.equal(empty.body.resources.cpuPercent,null);assert.equal(empty.body.verification.rate,null);
 const created=await request('/api/admin/networks',{name:'Compiler metrics isolated network',maxNodes:5,requireAdminApproval:false},admin.cookie);assert.equal(created.status,201);const network=created.body;
 const enrollment=await request(`/api${new URL(network.joinUrl).pathname}/accept`,{consent:true,workerType:'BROWSER',deviceIdentity:`metrics-ws-${target.instance}`});assert.equal(enrollment.status,201);
 socket=new WebSocket(target.base.replace(/^http/,'ws')+'/ws/worker',{headers:{Cookie:enrollment.cookie,Origin:origin}});
 socket.on('error',error=>{fatal=error;});socket.on('open',()=>socket.send(encodeProtocolMessage({type:'register',profile})));
 socket.on('message',raw=>{void(async()=>{const message=parseCoordinatorMessage(JSON.parse(raw.toString()));if(message.type==='registered'){nodeId=message.nodeId;socket.send(encodeProtocolMessage({type:'heartbeat',resources:resources()}));}else if(message.type==='task_assignment'){
   socket.send(encodeProtocolMessage({type:'task_state',taskId:message.taskId,attempt:message.attempt,status:'RUNNING'}));
   socket.send(encodeProtocolMessage({type:'heartbeat',resources:resources()}));
   const execution=await execute(message.payload);await pause(120);
   // Deliberately false worker processing claim must never become E2E duration.
   lastResult={type:'task_result',taskId:message.taskId,attempt:message.attempt,...execution,executionTimeMs:999999,resources:resources()};socket.send(encodeProtocolMessage(lastResult));
  }} )().catch(error=>{fatal=error;});});
 await poll(()=>{if(fatal)throw fatal;return nodeId;},Boolean,'worker registration');timer=setInterval(()=>{if(socket.readyState===WebSocket.OPEN)socket.send(encodeProtocolMessage({type:'heartbeat',resources:resources()}));},1000);
 await poll(async()=>{const [rows]=await store.pool.execute('SELECT status FROM nodes WHERE id=?',[nodeId]);return rows[0]?.status;},value=>value==='AVAILABLE','worker availability');
 const actualJobs=[];
 for(const user of users){
  const submitted=await request('/api/compilations',{language:'c',sourceName:'metrics.c',source:'int main(void) { int x = 2 + 3; return x; }'},user.cookie);assert.equal(submitted.status,202);actualJobs.push(submitted.body.id);
  const metrics=await poll(async()=>{if(fatal)throw fatal;return request(`/api/user/compiler-metrics?jobId=${submitted.body.id}`,undefined,user.cookie);},value=>value.status===200&&value.body.tasks.successful===1,'coordinator accepted actual IR computation');
  assert.equal(metrics.body.completion.count,1);assert.ok(metrics.body.completion.averageMs>=0&&metrics.body.completion.averageMs<999999,'E2E duration must use coordinator timestamps, not worker execution claim');assert.equal(metrics.body.verification.verified,1);assert.equal(metrics.body.resources.cpuPercent,null,'unavailable browser reading must not be zero');
 }
 assert.equal((await request(`/api/user/compiler-metrics?jobId=${actualJobs[0]}`,undefined,beta.cookie)).status,404,'foreign job metrics must be hidden');
 assert.equal((await request('/api/user/compiler-metrics?jobId=JOB-00000000-0000-0000-0000-000000000abc',undefined,alpha.cookie)).status,404,'legacy UUID job identifiers remain valid filter syntax without revealing ownership');
 assert.equal((await request('/api/user/compiler-metrics?platform=INVALID',undefined,alpha.cookie)).status,400);
 const duplicate=lastResult;socket.send(encodeProtocolMessage(duplicate));
 const duplicateSnapshot=await poll(()=>request(`/api/user/compiler-metrics?jobId=${actualJobs[1]}`,undefined,beta.cookie),value=>value.body.verification.rejected===1,'duplicate result rejection audit');
 assert.equal(duplicateSnapshot.body.tasks.successful,1);assert.equal(duplicateSnapshot.body.verification.verified,1);assert.equal(duplicateSnapshot.body.verification.rate,50);assert.ok(duplicateSnapshot.body.verification.history.some(row=>row.outcome==='REJECTED'&&row.taskId===duplicate.taskId));
 const [networkConfig]=await store.pool.execute('SELECT configuration_json configuration FROM distributed_networks WHERE id=?',[network.id]);
 const savedConfiguration=typeof networkConfig[0].configuration==='string'?networkConfig[0].configuration:JSON.stringify(networkConfig[0].configuration);
 try{
  const configured=JSON.parse(savedConfiguration);configured.policy={...(configured.policy??{}),minReliability:.5};
  await store.pool.execute('UPDATE distributed_networks SET configuration_json=? WHERE id=?',[JSON.stringify(configured),network.id]);
  const reliable=await request(`/api/user/compiler-metrics?jobId=${actualJobs[0]}`,undefined,alpha.cookie);
  assert.equal(reliable.body.availability.available,1,'persisted successful history must satisfy the same reliability policy as the scheduler');
 }finally{await store.pool.execute('UPDATE distributed_networks SET configuration_json=? WHERE id=?',[savedConfiguration,network.id]);}

 // Exact arithmetic fixtures below are labelled synthetic persisted records,
 // not claimed worker execution. The preceding IR results were actually computed
 // and accepted over the coordinator's authenticated, versioned protocol.
 const seededJob=await store.createCompilationJob(alpha.id,network.id,'python','fixture.py','print(1)');
 const nativeEnrollment=await networks.createEnrollment(network.joinToken??new URL(network.joinUrl).pathname.split('/').at(-1),'NATIVE',`metrics-offline-${target.instance}`,true);
 const nativeNode=await networks.register(nativeEnrollment.credential,{...profile,workerType:'NATIVE',operatingSystem:'Windows fixture',architecture:'x64'});assert.ok(nativeNode);
 await store.pool.execute("UPDATE nodes SET status='OFFLINE' WHERE id=?",[nativeNode.nodeId]);
 const now=new Date(),assigned=new Date(now.getTime()-300).toISOString(),at=now.toISOString();
 const cases=[['COMPLETED',null],['FAILED','TASK_FAILURE'],['FAILED','TIMEOUT'],['CANCELLED',null],['QUEUED',null],['RUNNING',null]];
 let telemetryTask,completedTask;
 for(const [status,reason] of cases){
  const id=`TASK-${randomUUID()}`,terminal=['COMPLETED','FAILED','CANCELLED'].includes(status),attempt=status==='QUEUED'?0:1;
  await store.pool.execute("INSERT INTO tasks(id,session_id,network_id,job_id,kind,payload_json,required_capability,status,attempt,created_at,completed_at) VALUES(?,NULL,?,?,'METRICS_FIXTURE','{}','metrics_fixture',?,?,?,?)",[id,network.id,seededJob.id,status,attempt,assigned,terminal?at:null]);
  if(attempt)await store.pool.execute('INSERT INTO task_attempts(task_id,attempt,node_id,status,scheduler_score,scheduler_explanation,assigned_at,completed_at,failure_reason,lease_expires_at) VALUES(?,1,?,?,0,?,?,?,?,TIMESTAMPADD(SECOND,300,UTC_TIMESTAMP(3)))',[id,nativeNode.nodeId,status==='FAILED'&&reason==='TIMEOUT'?'TIMED_OUT':status,'Synthetic arithmetic fixture, not executed work',assigned,terminal?at:null,reason]);
  if(status==='COMPLETED'){completedTask=id;await store.pool.execute("INSERT INTO result_verifications(id,task_id,node_id,attempt,outcome,method,received_at,completed_at) VALUES(?,?,?,1,'VERIFIED','synthetic-metric-arithmetic-fixture',?,?)",[`VERIFY-${randomUUID()}`,id,nativeNode.nodeId,at,at]);await store.metrics.sampleAvailability();}
  if(status==='RUNNING')telemetryTask=id;
 }
 for(const [cpu,ram,observed] of [[20,null,at],[40,60,at],[100,100,new Date(now.getTime()-120000).toISOString()]])await store.pool.execute('INSERT INTO worker_telemetry(task_id,node_id,platform,cpu_percent,ram_percent,observed_at) VALUES(?,?,?,?,?,?)',[telemetryTask,nativeNode.nodeId,'WINDOWS',cpu,ram,observed]);
 await store.metrics.sampleAvailability();
 const fixture=await request(`/api/user/compiler-metrics?jobId=${seededJob.id}`,undefined,alpha.cookie);assert.equal(fixture.status,200);const m=fixture.body;
 assert.equal(m.tasks.successful,1);assert.equal(m.tasks.failed,1);assert.equal(m.tasks.timedOut,1);assert.equal(m.tasks.cancelled,1);assert.equal(m.tasks.pending,1);assert.equal(m.tasks.running,1);assert.equal(m.tasks.totalCompleted,3);assert.ok(Math.abs(m.tasks.successRate-100/3)<1e-9);
 assert.equal(m.completion.averageMs,300);assert.equal(m.completion.count,1);assert.equal(m.resources.cpuPercent,30);assert.equal(m.resources.ramPercent,60);assert.equal(m.resources.cpuReadings,2);assert.equal(m.resources.ramReadings,1);assert.equal(m.availability.registered,1);assert.equal(m.availability.disconnected,1);assert.equal(m.availability.percentage,0);assert.ok(m.availability.history.length>=1);assert.equal(m.tasks.trend.length,1);
 const webOnly=await request(`/api/user/compiler-metrics?jobId=${seededJob.id}&platform=WEB`,undefined,alpha.cookie);assert.equal(webOnly.body.tasks.totalCompleted,0);assert.equal(webOnly.body.resources.cpuPercent,null);
 const python=await request('/api/user/compiler-metrics?language=python&platform=WINDOWS',undefined,alpha.cookie);assert.equal(python.body.tasks.successful,1);assert.equal(python.body.completion.averageMs,300);
 const betaOnly=await request('/api/user/compiler-metrics',undefined,beta.cookie);assert.equal(betaOnly.body.tasks.successful,1);assert.equal(betaOnly.body.tasks.failed,0);assert.equal(betaOnly.body.resources.cpuPercent,null,'another user must not receive telemetry from shared network participants');

 // Eligibility edge cases mutate only registrations in this proven isolated DB.
 const [[savedEnrollment]]=await store.pool.execute('SELECT expires_at expiresAt FROM network_enrollments WHERE id=?',[nativeEnrollment.enrollmentId]);
 try{
  await store.pool.execute('UPDATE network_enrollments SET expires_at=? WHERE id=?',[new Date(Date.now()-60000).toISOString(),nativeEnrollment.enrollmentId]);
  assert.equal((await store.metrics.read(alpha.id,{jobId:seededJob.id})).availability.registered,0,'expired registrations must not remain in the active denominator');
 }finally{await store.pool.execute('UPDATE network_enrollments SET expires_at=? WHERE id=?',[savedEnrollment.expiresAt,nativeEnrollment.enrollmentId]);}
 try{
  await store.pool.execute("UPDATE distributed_networks SET status='DISABLED' WHERE id=?",[network.id]);
  assert.equal((await store.metrics.read(alpha.id,{jobId:seededJob.id})).availability.registered,0,'disabled networks must not advertise registered active participants');
 }finally{await store.pool.execute("UPDATE distributed_networks SET status='ACTIVE' WHERE id=?",[network.id]);}
 const [[savedNative]]=await store.pool.execute('SELECT profile_json profile FROM nodes WHERE id=?',[nativeNode.nodeId]);
 const nativeProfile=typeof savedNative.profile==='string'?JSON.parse(savedNative.profile):savedNative.profile;
 try{
  for(const operatingSystem of ['Linux fixture','Unknown native fixture']){
   await store.pool.execute('UPDATE nodes SET profile_json=? WHERE id=?',[JSON.stringify({...nativeProfile,operatingSystem}),nativeNode.nodeId]);
   const other=await store.metrics.read(alpha.id,{jobId:seededJob.id});assert.equal(other.availability.registered,1);assert.equal(other.availability.platforms.find(row=>row.platform==='WINDOWS').registered,0,`${operatingSystem} must not be classified as Windows`);
   assert.equal((await store.metrics.read(alpha.id,{jobId:seededJob.id,platform:'WINDOWS'})).tasks.successful,0);
  }
 }finally{await store.pool.execute('UPDATE nodes SET profile_json=? WHERE id=?',[JSON.stringify(nativeProfile),nativeNode.nodeId]);}
 await store.pool.execute("UPDATE nodes SET status='UNAVAILABLE',last_heartbeat=? WHERE id=?",[new Date().toISOString(),nativeNode.nodeId]);
 const unavailable=await store.metrics.read(alpha.id,{jobId:seededJob.id});assert.equal(unavailable.availability.connected,0);assert.equal(unavailable.availability.available,0);assert.equal(unavailable.availability.unhealthy,1);
 await store.pool.execute("UPDATE nodes SET status='BUSY',current_task_id=?,last_heartbeat=? WHERE id=?",[telemetryTask,new Date().toISOString(),nativeNode.nodeId]);
 await store.metrics.sampleForNode(nativeNode.nodeId);
 const oldObservation=new Date(Date.now()-180000).toISOString();
 await store.pool.execute('UPDATE worker_telemetry SET observed_at=? WHERE task_id=?',[oldObservation,telemetryTask]);
 await store.metrics.telemetry(nativeNode.nodeId,{cpuUtilizationPercent:88,cpuMeasurementAvailable:true,freeMemoryBytes:2e9,memoryUtilizationPercent:77,memoryMeasurementAvailable:true,observedAt:oldObservation});
 const stale=await store.metrics.read(alpha.id,{jobId:seededJob.id});assert.equal(stale.resources.cpuPercent,null);assert.equal(stale.resources.ramPercent,null);assert.equal(stale.resources.cpuReadings,0);assert.equal(stale.resources.ramReadings,0);assert.equal(stale.resources.lastUpdatedAt,oldObservation,'cached telemetry receipt must retain its actual source observation timestamp');
 const [beforeFuture]=await store.pool.execute('SELECT COUNT(*) count FROM worker_telemetry WHERE task_id=?',[telemetryTask]);
 await store.metrics.telemetry(nativeNode.nodeId,{cpuUtilizationPercent:1,cpuMeasurementAvailable:true,freeMemoryBytes:2e9,memoryUtilizationPercent:1,memoryMeasurementAvailable:true,observedAt:new Date(Date.now()+60000).toISOString()});
 const [afterFuture]=await store.pool.execute('SELECT COUNT(*) count FROM worker_telemetry WHERE task_id=?',[telemetryTask]);assert.equal(afterFuture[0].count,beforeFuture[0].count,'future-dated observations must not enter telemetry');
 await store.pool.execute("UPDATE nodes SET status='OFFLINE',current_task_id=NULL,disconnected_at=? WHERE id=?",[new Date().toISOString(),nativeNode.nodeId]);await store.metrics.sampleForNode(nativeNode.nodeId);
 const history=await store.metrics.read(alpha.id,{jobId:seededJob.id});assert.ok(history.availability.history.some(row=>row.busy===1),'busy transition must be recorded');assert.ok(history.availability.history.some(row=>row.disconnected===1),'disconnection must be recorded');
 const completionHistory=await store.metrics.read(beta.id,{jobId:actualJobs[1]});assert.ok(completionHistory.availability.history.some(row=>row.busy>=1),'real RUNNING transition must be captured for short jobs');assert.ok(completionHistory.availability.history.some(row=>row.busy===0),'real accepted completion must capture the worker leaving BUSY');
 await store.pool.execute('UPDATE nodes SET revoked_at=? WHERE id=?',[at,nativeNode.nodeId]);
 const revoked=await request(`/api/user/compiler-metrics?jobId=${seededJob.id}`,undefined,alpha.cookie);assert.equal(revoked.body.availability.registered,0);assert.equal(revoked.body.availability.percentage,null);assert.equal(revoked.body.tasks.successful,1,'revocation must preserve historical task outcomes');
 assert.ok(completedTask);
 // A native payload passing format checks is not yet a verified compilation.
 // These are explicitly synthetic state-machine fixtures, not executed programs.
 const pendingNative=await store.createCompilationJob(alpha.id,network.id,'c','native-fixture.c','int main(void){return 0;}'),nativeTask=`TASK-${randomUUID()}`;
 await store.pool.execute("INSERT INTO tasks(id,network_id,job_id,kind,payload_json,required_capability,status,attempt,created_at,completed_at) VALUES(?,?,?,'C_COMPILE','{}','c','COMPLETED',1,?,?)",[nativeTask,network.id,pendingNative.id,at,at]);
 const formatId=await store.metrics.begin(nativeTask,nativeNode.nodeId,1,'identity-schema-artifact-format');await store.metrics.finish(formatId,'VERIFIED');
 const awaiting=await store.metrics.read(alpha.id,{jobId:pendingNative.id});assert.equal(awaiting.tasks.successful,0,'format acceptance must not become compilation success');assert.equal(awaiting.tasks.pending,1);
 const independentId=await store.metrics.begin(nativeTask,nativeNode.nodeId,1,'independent-source-recompilation');await store.metrics.finish(independentId,'REJECTED');
 const rejectedCompilation=await store.metrics.read(alpha.id,{jobId:pendingNative.id});assert.equal(rejectedCompilation.tasks.successful,0);assert.equal(rejectedCompilation.tasks.failed,1);assert.equal(rejectedCompilation.verification.rate,50);
 let rateLimited=false;for(let i=0;i<45;i++){const response=await request('/api/user/compiler-metrics',undefined,alpha.cookie);if(response.status===429){rateLimited=true;break;}assert.equal(response.status,200);}assert.ok(rateLimited,'one owner must have a bounded polling budget');
 assert.equal((await request('/api/user/compiler-metrics',undefined,beta.cookie)).status,200,'users sharing an IP must not consume each other\'s metric budgets');
 console.log(JSON.stringify({ownerIsolation:true,adminExcluded:true,actualIRComputationAndCoordinatorAcceptance:true,duplicateRejectionRecorded:true,endToEndUsesCoordinatorReceipt:true,languageAndPlatformFilters:true,allFiveMetricSnapshots:true,nullTelemetryNotZero:true,revokedDenominatorExcluded:true,expiredAndDisabledDenominatorExcluded:true,linuxAndUnknownNotWindows:true,unavailableNotConnected:true,staleSourceTimestampPreserved:true,futureTelemetryRejected:true,busyCompletionAndDisconnectHistory:true,availabilityHistory:true,exactArithmeticUsesLabelledPersistedFixtures:true,worker:'logical authenticated WebSocket fixture executing real IR optimizer; not physical browser/Windows/Android acceptance'}));
}finally{clearInterval(timer);socket?.terminate();await store.close();}
