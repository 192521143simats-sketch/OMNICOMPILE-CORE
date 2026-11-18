import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import mysql from 'mysql2/promise';
import {KubernetesExecutionProvider} from '../apps/coordinator/src/kubernetes-execution.ts';
import {createDockerExecutor} from '../apps/coordinator/src/docker-executor.ts';
import {assertIsolatedTarget,verifyIsolatedCoordinator} from './Integration-Target.mjs';

const target=assertIsolatedTarget();
await verifyIsolatedCoordinator(target);
const pool=mysql.createPool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),database:target.database,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
const jobs=new Map();
const warmPods=new Map();
const warmMaps=new Map();
const warmLanguage='omnicompile.io/prewarm-language';
let warmCommits=0;
let coldCreates=0;
const label='omnicompile.io/execution-id';
let complete=true;
let failureReason;
let inputProvisioningError=false;
let logResult={ok:true,result:{stdout:'fixture'}};
let runnerState={terminated:{startedAt:"2026-01-01T00:00:00Z",finishedAt:"2026-01-01T00:00:03Z"}};
let scheduledAt='2025-12-31T23:59:59Z';
let observedJob;
let jobReads=0;
let podReads=0;
const failedDeletes=new Set();
let deferDeletion=false;
let failNextJobCleanup=false;
const quotaHard={pods:'5','requests.cpu':'1250m','requests.memory':'1280Mi'};
let quotaUsed;
let beforeWarmCommit;
const demandSources={c:'int main(void){return 0;}',java:'class Main {}'};
const api=async(method,path,body)=>{
  const name=path.split('/').at(-1);
  if(method==='GET'&&path==='/api/v1/namespaces/fixture/resourcequotas/execution-capacity'){
    return quotaUsed?{apiVersion:'v1',kind:'ResourceQuota',metadata:{name,namespace:'fixture'},
      spec:{hard:quotaHard},status:{hard:quotaHard,used:quotaUsed}}:null;
  }
  if(method==='GET'&&path.includes('/pods?limit=12'))return {items:[...warmPods.values()]};
  if(method==='POST'&&name==='pods'){
    const pod={...body,metadata:{...body.metadata,uid:randomUUID(),creationTimestamp:new Date().toISOString()},
      status:{phase:'Running',conditions:[{type:'Ready',status:'True'}]}};
    warmPods.set(pod.metadata.name,pod);
    return pod;
  }
  if(path.includes('/pods/omni-warm-')&&!path.includes('/log?')){
    const pod=warmPods.get(name);
    if(method==='DELETE'){
      assert.equal(body.preconditions.uid,pod?.metadata.uid);
      warmPods.delete(name);
      return null;
    }
    return pod??null;
  }
  if(method==='GET'&&path.includes('/configmaps?')){
    const selector=new URLSearchParams(path.split('?')[1]).get('labelSelector')??'';
    const podName=selector.match(/omnicompile.io\/prewarm-pod=([^,]+)/)?.[1];
    return {items:[...warmMaps.values()].filter(map=>map.metadata.ownerReferences[0].name===podName)};
  }
  if(method==='DELETE'&&path.includes('/configmaps/')){
    assert.equal(body.preconditions.uid,warmMaps.get(name)?.metadata.uid);
    warmMaps.delete(name);return null;
  }
  if(method==='POST'&&name==='jobs'){
    coldCreates++;
    assert.equal(body.spec.template.spec.automountServiceAccountToken,false);
    assert.equal(body.spec.template.spec.runtimeClassName,'sandbox-test');
    assert.equal(body.spec.activeDeadlineSeconds,105);
    const record={metadata:{...body.metadata,uid:randomUUID(),creationTimestamp:'2025-12-31T23:59:58Z'}};
    jobs.set(record.metadata.name,record);
    if(failNextJobCleanup)failedDeletes.add(record.metadata.name);
    observedJob=record.metadata.labels[label];
    return record;
  }
  if(method==='POST'&&name==='configmaps'){
    if(inputProvisioningError)throw new Error('Fixture provisioning failure');
    assert.equal(body.immutable,true);
    const owner=body.metadata.ownerReferences[0];
    if(owner.kind==='Pod'){
      const pod=warmPods.get(owner.name);
      assert.equal(pod?.metadata.uid,owner.uid);
      const map={...body,metadata:{...body.metadata,uid:randomUUID()}};
      warmMaps.set(map.metadata.name,map);
      if(map.metadata.name.endsWith('-commit')){
        await beforeWarmCommit?.();
        const envelope=JSON.parse(Buffer.from(body.binaryData.payload,'base64'));
        assert.equal(envelope.executionId,map.metadata.labels[label]);
        assert.equal(envelope.podId,pod.metadata.name);
        assert.equal(envelope.chunkCount,1);
        warmCommits++;
        pod.status={phase:'Succeeded'};
      }
      return map;
    }
    assert.equal(jobs.get(owner.name)?.metadata.uid,owner.uid);
    const input=JSON.parse(Buffer.from(body.binaryData.payload,'base64'));
    const demandLanguage=Object.keys(demandSources).find(language=>demandSources[language]===input.payload.generatedSource);
    assert.equal(input.language,demandLanguage??'python');
    return {};
  }
  if(path.includes('/pods?')){
    podReads++;
    const id=decodeURIComponent(path.split('=').at(-1)).split('=').at(-1);
    return {items:[{metadata:{name:'foreign-pod',ownerReferences:[{kind:'Job',uid:'foreign'}]},status:{containerStatuses:[{name:'runner',state:{running:{startedAt:'2026-01-01T00:00:00Z'}}}]}},{metadata:{name:'test-pod',ownerReferences:[{kind:'Job',uid:jobs.get('omni-'+id)?.metadata.uid}]},status:{conditions:scheduledAt?[{type:'PodScheduled',status:'True',lastTransitionTime:scheduledAt}]:[],containerStatuses:[{name:'runner',state:runnerState}]}}]};
  }
  if(path.includes('/log?'))return logResult===null?'incomplete output':JSON.stringify(logResult);
  if(method==='GET'&&name==='jobs?limit=1')return {items:[]};
  if(method==='GET'){
    jobReads++;
    const record=jobs.get(name);
    return record?{...record,status:{succeeded:complete?1:0,conditions:failureReason?[{type:'Failed',status:'True',reason:failureReason}]:[]}}:null;
  }
  if(method==='DELETE'){
    assert.equal(body.preconditions.uid,jobs.get(name)?.metadata.uid);
    assert.equal(body.propagationPolicy,'Foreground');
    if(failedDeletes.has(name))throw new Error('Fixture deletion failure');
    if(deferDeletion){
      jobs.get(name).metadata.deletionTimestamp='2026-01-01T00:00:04Z';
      return {};
    }
    jobs.delete(name);
    return {};
  }
  throw new Error('Unexpected cluster request '+path);
};
const image='registry.example.invalid/toolchain@sha256:'+'a'.repeat(64);
const create=(enabled=false,db=pool,policy='fixed')=>
  new KubernetesExecutionProvider(db,api,'fixture','sandbox-test',{c:image,python:image,java:image},enabled,policy);
const job={kind:'execute',language:'python',payload:{language:'python',sourceName:'main.py',generatedSource:'print(42)',input:''}};
const provider=create();
const fixtureToken=randomUUID();
const broker=createDockerExecutor(fixtureToken,undefined,{kubernetes:provider});
const acknowledge=(requestId,authorized=true)=>broker.inject({
  method:'POST',url:'/execution-receipts/'+requestId+'/ack',
  headers:authorized?{authorization:'Bearer '+fixtureToken}:{}
});
const start=()=>provider.run(job,new AbortController().signal);
async function verifyBrokerCapacity(busy){
  const response=await broker.inject({url:'/executions',headers:{authorization:'Bearer '+fixtureToken}});
  assert.equal(response.statusCode,200);
  assert.deepEqual(response.json().capacity,{busy,limit:2});
}
async function countSlots(){
  const [[row]]=await pool.query('SELECT COUNT(*) total FROM kubernetes_executions WHERE slot IS NOT NULL');
  return Number(row.total);
}
async function waitForJobReads(baseline){
  for(let i=0;i<150&&jobReads<baseline+2;i++)await delay(20);
  assert.ok(jobReads>=baseline+2,'Execution Job polling did not reach two reads');
}
async function running(){
  for(let i=0;i<100;i++){
    const rows=(await provider.list()).filter(row=>row.state==='RUNNING');
    if(rows.length===2)return rows;
    await delay(20);
  }
  throw new Error('Two fixture executions did not start');
}
async function verifyDemandPrewarm(){
  const demand=create(true,pool,'demand');
  const readyLanguages=()=>[...warmPods.values()].map(pod=>pod.metadata.labels[warmLanguage]).sort();
  quotaUsed={pods:'0','requests.cpu':'0','requests.memory':'0'};
  await demand.reconcile();
  assert.deepEqual(readyLanguages(),[],'Available quota alone must not warm an unused language');

  await start();
  const recentIds=[observedJob];
  quotaUsed=undefined;
  await demand.reconcile();
  assert.deepEqual(readyLanguages(),[],'Missing quota must prevent new warm Pods');
  quotaUsed={pods:'5','requests.cpu':'1250m','requests.memory':'1280Mi'};
  await demand.reconcile();
  assert.deepEqual(readyLanguages(),[],'Full quota must prevent new warm Pods');
  quotaUsed={pods:'0','requests.cpu':'0','requests.memory':'0'};
  await demand.reconcile();
  assert.deepEqual(readyLanguages(),['python'],'A real cold execution must warm only its language');

  for(const [language,generatedSource] of Object.entries(demandSources)){
    const sourceName=language==='c'?'main.c':'Main.java';
    await provider.run({kind:'execute',language,payload:{language,sourceName,generatedSource,input:''}},
      new AbortController().signal);
    recentIds.push(observedJob);
  }
  quotaUsed={pods:'4','requests.cpu':'1','requests.memory':'1Gi'};
  await demand.reconcile();
  const languagesWithOneFreePod=readyLanguages();
  assert.equal(languagesWithOneFreePod.length,2,'One free unit of quota permits at most one additional warm Pod');
  assert.ok(languagesWithOneFreePod.includes('python'),'A quota-limited pass must keep the existing idle Pod');
  quotaUsed={pods:'2','requests.cpu':'500m','requests.memory':'512Mi'};
  await demand.reconcile();
  assert.deepEqual(readyLanguages(),['c','java','python']);

  const commitReached=Promise.withResolvers();
  const releaseCommit=Promise.withResolvers();
  beforeWarmCommit=()=>{
    commitReached.resolve();
    return releaseCommit.promise;
  };
  const execution=Promise.allSettled([demand.run(job,new AbortController().signal)]);
  try{
    await Promise.race([
      commitReached.promise,
      execution.then(()=>{throw new Error('Warm execution settled before committing input');}),
    ]);
    const [[reservation]]=await pool.execute(
      "SELECT p.pod_name,p.execution_id,e.slot FROM kubernetes_prewarm_slots p JOIN kubernetes_executions e ON e.id=p.execution_id WHERE p.language='python' AND p.state='CLAIMED'");
    assert.ok(reservation?.slot,'The waiting commit must have an active SQL execution reservation');
    await pool.execute('UPDATE kubernetes_executions SET created_at=TIMESTAMPADD(SECOND,-301,CURRENT_TIMESTAMP(3)) WHERE id IN (?,?,?,?)',
      [...recentIds,reservation.execution_id]);
    await demand.reconcile();
    assert.deepEqual(readyLanguages(),['python'],'Expired demand must drain pristine warm Pods');
    assert.ok(warmPods.has(reservation.pod_name),'An active claim must survive expiry of its demand history');
  }finally{
    releaseCommit.resolve();
    beforeWarmCommit=undefined;
    await execution;
  }
  assert.deepEqual(await execution,[{status:'fulfilled',value:{stdout:'fixture'}}]);
  await demand.reconcile();
  assert.deepEqual(readyLanguages(),[],'Expired demand must not replace the former claim');
  const [[{total}]]=await pool.query('SELECT COUNT(*) total FROM kubernetes_prewarm_slots');
  assert.equal(total,0);
  assert.equal(warmMaps.size,0);
  assert.equal(await countSlots(),0);
  quotaUsed=undefined;
}

try{
  await provider.ready();
  await verifyDemandPrewarm();
  assert.equal((await broker.inject('/executions')).statusCode,401);
  await verifyBrokerCapacity(0);
  const acknowledgedId=randomUUID();
  assert.equal((await acknowledge(acknowledgedId,false)).statusCode,401);
  assert.equal((await acknowledge('invalid')).statusCode,400);
  assert.equal((await acknowledge(acknowledgedId)).statusCode,404);
  await provider.run(job,new AbortController().signal,undefined,acknowledgedId);
  const acknowledgedJob=observedJob;
  const ackResponses=await Promise.all([acknowledge(acknowledgedId),acknowledge(acknowledgedId)]);
  assert.deepEqual(ackResponses.map(response=>response.statusCode),[204,204]);
  const [[acknowledged]]=await pool.execute('SELECT request_id,receipt_slot,receipt_digest FROM kubernetes_executions WHERE id=?',[acknowledgedJob]);
  assert.equal(acknowledged.request_id,acknowledgedId);
  assert.equal(acknowledged.receipt_slot,null);
  assert.equal(acknowledged.receipt_digest,null);
  const [[acknowledgedChunks]]=await pool.execute('SELECT COUNT(*) AS total FROM kubernetes_result_chunks WHERE execution_id=?',[acknowledgedJob]);
  assert.equal(Number(acknowledgedChunks.total),0);
  await assert.rejects(create().run(job,new AbortController().signal,undefined,acknowledgedId),{statusCode:410});
  assert.equal(observedJob,acknowledgedJob,'An acknowledged request must not create another Job');
  const cleanupId=randomUUID();
  failNextJobCleanup=true;
  await provider.run(job,new AbortController().signal,undefined,cleanupId);
  failNextJobCleanup=false;
  const cleanupJob=observedJob;
  assert.equal((await provider.list()).find(row=>row.id===cleanupJob).state,'CLEANUP_PENDING');
  assert.equal((await acknowledge(cleanupId)).statusCode,204);
  failedDeletes.delete('omni-'+cleanupJob);
  await provider.reconcile();
  assert.equal((await provider.list()).find(row=>row.id===cleanupJob).state,'SUCCEEDED');
  const requestId=randomUUID();
  const keyed=(service,input=job)=>service.run(input,new AbortController().signal,undefined,requestId);
  assert.deepEqual(await keyed(provider),{stdout:'fixture'});
  const keyedJob=observedJob;
  assert.deepEqual(await keyed(create(),{payload:job.payload,kind:job.kind,language:job.language}),{stdout:'fixture'});
  assert.equal(observedJob,keyedJob,'Replay must not create a second Job');
  await assert.rejects(keyed(create(),{...job,payload:{...job.payload,generatedSource:'print(43)'}}),{statusCode:409,errorCode:'EXECUTION_REQUEST_CONFLICT'});
  await pool.execute('UPDATE kubernetes_executions SET receipt_expires_at=UTC_TIMESTAMP(3) WHERE id=?',[keyedJob]);
  await provider.reconcile();
  await assert.rejects(keyed(create()),{statusCode:410,errorCode:'EXECUTION_RECEIPT_UNAVAILABLE'});
  const [[expiredReceipt]]=await pool.execute('SELECT receipt_slot FROM kubernetes_executions WHERE id=?',[keyedJob]);
  assert.equal(expiredReceipt.receipt_slot,null);
  const [[storedChunks]]=await pool.execute('SELECT COUNT(*) AS total FROM kubernetes_result_chunks WHERE execution_id=?',[keyedJob]);
  assert.equal(Number(storedChunks.total),0);
  assert.equal((await acknowledge(requestId)).statusCode,204);
  const pendingId=randomUUID();
  complete=false;
  const pendingSignal=new AbortController();
  const previousReads=jobReads;
  const pendingReceipt=provider.run(job,pendingSignal.signal,undefined,pendingId);
  const cancelledPending=assert.rejects(pendingReceipt);
  await waitForJobReads(previousReads);
  assert.equal((await acknowledge(pendingId)).statusCode,409);
  await assert.rejects(create().run(job,new AbortController().signal,undefined,pendingId),
    {statusCode:409,errorCode:'EXECUTION_REQUEST_PENDING'});
  pendingSignal.abort();
  await cancelledPending;
  assert.equal((await acknowledge(pendingId)).statusCode,410);
  await provider.reconcile();
  complete=true;
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.deepEqual(await start(),{stdout:'fixture'});
  assert.equal(await countSlots(),0,'A confirmed deletion should release its slot without waiting for reconciliation');
  await provider.reconcile();
  const [completed]=await create().list();
  assert.equal(completed.state,'SUCCEEDED');
  assert.equal(completed.runnerDurationMs,3000);
  assert.equal(completed.provisioningDurationMs,2000);
  assert.equal(completed.schedulingDurationMs,1000);
  assert.equal(completed.containerStartupDurationMs,1000);
  assert.equal(completed.capacityRetryWaitMs,null);
  assert.equal(completed.failureReason,null);
  inputProvisioningError=true;
  await assert.rejects(start(),/fixture provisioning failure/i);
  assert.equal((await create().list()).find(row=>row.id===observedJob).failureReason,'PROVISIONING_FAILED');
  inputProvisioningError=false;
  logResult=null;
  await assert.rejects(start());
  assert.equal((await create().list()).find(row=>row.id===observedJob).failureReason,'RESULT_COLLECTION_FAILED');
  logResult={ok:false,error:{message:'Fixture compiler failure'}};
  failNextJobCleanup=true;
  await assert.rejects(start(),/fixture compiler failure/i);
  const failedId=observedJob;
  const pendingCleanup=(await create().list()).find(row=>row.id===failedId);
  assert.equal(pendingCleanup.state,'CLEANUP_PENDING');
  assert.equal(pendingCleanup.failureReason,'EXECUTION_FAILED');
  failedDeletes.clear();
  failNextJobCleanup=false;
  await create().reconcile();
  const cleanedFailure=(await provider.list()).find(row=>row.id===failedId);
  assert.equal(cleanedFailure.state,'FAILED');
  assert.equal(cleanedFailure.failureReason,'EXECUTION_FAILED');
  logResult={ok:true,result:{execution:{status:'FAILED',exitCode:1}}};
  assert.deepEqual(await start(),logResult.result);
  const nonzeroExit=(await create().list()).find(row=>row.id===observedJob);
  assert.equal(nonzeroExit.state,'SUCCEEDED');
  assert.equal(nonzeroExit.failureReason,null);
  logResult={ok:true,result:{stdout:'fixture'}};
  for(const invalidSchedule of [undefined,'2025-12-31T23:59:57Z','2026-01-01T00:00:01Z']){
    scheduledAt=invalidSchedule;
    assert.deepEqual(await start(),{stdout:'fixture'});
    const row=(await create().list()).find(item=>item.id===observedJob);
    assert.equal(row.provisioningDurationMs,2000);
    assert.equal(row.schedulingDurationMs,null);
    assert.equal(row.containerStartupDurationMs,null);
  }
  scheduledAt='2025-12-31T23:59:59Z';
  deferDeletion=true;
  assert.deepEqual(await start(),{stdout:'fixture'});
  assert.equal(await countSlots(),1,'A terminating Job should still hold its slot');
  await verifyBrokerCapacity(1);
  await provider.reconcile();
  assert.equal(await countSlots(),1);
  jobs.delete('omni-'+observedJob);
  deferDeletion=false;
  await provider.reconcile();
  assert.equal(await countSlots(),0);
  await verifyBrokerCapacity(0);
  for(const [header,expected] of [['875',875],['0',0],['125000',125000],['125001',null],['-1',null],['1.5',null],['1e3',null],[['20','30'],null]]){
    await provider.run(job,new AbortController().signal,header);
    await provider.reconcile();
    assert.equal((await create().list())[0].capacityRetryWaitMs,expected);
  }
  complete=false;
  runnerState={waiting:{reason:'ContainerCreating'}};
  failureReason='DeadlineExceeded';
  await assert.rejects(start(),/execution deadline/i);
  await provider.reconcile();
  const [deadline]=await provider.list();
  assert.equal(deadline.state,'TIMED_OUT');
  assert.equal(deadline.failureReason,'DEADLINE_EXCEEDED');
  assert.equal(jobs.size,0);
  failureReason=undefined;
  // An unscheduled/image-pulling runner stays PROVISIONING, even with a foreign running Pod.
  runnerState={waiting:{reason:'ContainerCreating'}};
  let pending=start();
  let pendingSettled=Promise.allSettled([pending]);
  const baseline=jobReads;
  await waitForJobReads(baseline);
  assert.equal((await provider.list()).find(row=>row.id===observedJob).state,'PROVISIONING');
  runnerState={running:{startedAt:'2026-01-01T00:00:00Z'}};
  for(let i=0;i<100&&(await provider.list()).find(row=>row.id===observedJob).state!=='RUNNING';i++)await delay(20);
  assert.equal((await provider.list()).find(row=>row.id===observedJob).state,'RUNNING');
  const activePodReads=podReads;
  await waitForJobReads(jobReads);
  assert.equal(podReads,activePodReads,'An active runner should be tracked through its Job status');
  runnerState={terminated:{startedAt:'2026-01-01T00:00:00Z',finishedAt:'2026-01-01T00:00:03Z'}};
  complete=true;
  assert.deepEqual((await pendingSettled)[0],{status:'fulfilled',value:{stdout:'fixture'}});
  assert.equal((await provider.list()).find(row=>row.id===observedJob).runnerDurationMs,3000);
  await provider.reconcile();
  complete=false;
  runnerState={waiting:{reason:'ImagePullBackOff'}};
  pending=start();
  pendingSettled=Promise.allSettled([pending]);
  const nextBaseline=jobReads;
  await waitForJobReads(nextBaseline);
  assert.equal((await provider.list()).find(row=>row.id===observedJob).state,'PROVISIONING');
  const cancelledId=observedJob;
  assert.equal(await provider.cancel(cancelledId),true);
  assert.equal((await pendingSettled)[0].status,'rejected');
  await provider.reconcile();
  assert.equal((await provider.list()).find(row=>row.id===cancelledId).state,'CANCELLED');
  assert.equal((await create().list()).find(row=>row.id===cancelledId).failureReason,'CANCELLED');
  runnerState={running:{startedAt:'2026-01-01T00:00:00Z'}};
  const first=start(),second=start();
  const settled=Promise.allSettled([first,second]);
  const rows=await running();
  await verifyBrokerCapacity(2);
  const rowsBeforeCapacityRejection=(await provider.list()).length;
  await assert.rejects(start(),{statusCode:429});
  assert.equal((await provider.list()).length,rowsBeforeCapacityRejection);
  assert.equal(await provider.cancel(rows[0].id),true);
  failedDeletes.add('omni-'+rows[0].id);
  failedDeletes.add('omni-'+rows[1].id);
  assert.equal(await provider.cancel(rows[1].id),true);
  assert.deepEqual((await settled).map(result=>result.status),['rejected','rejected']);
  assert.equal(jobs.size,2);
  failedDeletes.clear();
  const restarted=create();
  await restarted.reconcile();
  await restarted.reconcile();
  assert.equal(jobs.size,0);
  for(const row of rows){
    const recovered=(await restarted.list()).find(item=>item.id===row.id);
    assert.equal(recovered.state,'CANCELLED');
    assert.equal(recovered.failureReason,'CANCELLED');
  }
  const [[{total}]]=await pool.query('SELECT COUNT(*) total FROM kubernetes_executions WHERE slot IS NOT NULL');
  assert.equal(total,0);
  const expired=randomUUID();
  await pool.execute("INSERT INTO kubernetes_executions(id,slot,language,kind,state,expires_at) VALUES(?,1,'python','execute','PROVISIONING',UTC_TIMESTAMP(3))",[expired]);
  await restarted.reconcile();
  assert.equal((await restarted.list()).find(row=>row.id===expired).state,'TIMED_OUT');
  assert.equal((await restarted.list()).find(row=>row.id===expired).failureReason,'DEADLINE_EXCEEDED');
  complete=true;
  runnerState={terminated:{startedAt:'2026-01-01T00:00:00Z',finishedAt:'2026-01-01T00:00:03Z'}};
  const warmA=create(true),warmB=create(true);
  await Promise.all([warmA.reconcile(),warmB.reconcile()]);
  assert.equal(warmPods.size,3);
  const [[{total:pristineRows}]]=await pool.query('SELECT COUNT(*) total FROM kubernetes_prewarm_slots');
  assert.equal(pristineRows,3);
  const baselineJobs=coldCreates;
  const commitsBefore=warmCommits;
  const warmKey=randomUUID(),secondKey=randomUUID();
  await Promise.all([[warmA,warmKey],[warmB,secondKey]].map(([service,key])=>service.run(job,new AbortController().signal,undefined,key)));
  assert.equal(coldCreates,baselineJobs+1,'Exactly one request must run cold');
  assert.equal(warmCommits,commitsBefore+1,'Exactly one request can publish to a warm Pod');
  assert.equal(warmMaps.size,0);
  assert.equal(await countSlots(),0);
  const [timings]=await pool.execute('SELECT runner_duration_ms FROM kubernetes_executions WHERE request_id IN (?,?)',[warmKey,secondKey]);
  assert.equal(timings.filter(row=>row.runner_duration_ms===null).length,1,'Warm runner lifetime must not be reported as execution duration');
  assert.deepEqual(await create().run(job,new AbortController().signal,undefined,warmKey),{stdout:'fixture'});

  await warmA.reconcile();
  let delayedCommit;
  let ambiguousId;
  const ambiguousPool={
    execute:async(sql,params)=>{
      if(!sql.includes('UPDATE kubernetes_prewarm_slots AS p'))return pool.execute(sql,params);
      ambiguousId=params[0];
      const connection=await pool.getConnection();
      try{
        await connection.beginTransaction();
        const [changed]=await connection.execute(sql,params);
        assert.equal(changed.affectedRows,1,'Fixture must mutate an uncommitted warm claim');
        delayedCommit=delay(150).then(()=>connection.commit()).finally(()=>connection.release());
      }catch(error){
        await connection.rollback();
        connection.release();
        throw error;
      }
      throw Error('Fixture disconnected before claim commit was visible');
    },
  };
  const coldBeforeAmbiguous=coldCreates;
  await assert.rejects(create(true,ambiguousPool).run(job,new AbortController().signal),/disconnected/);
  await delayedCommit;
  const [[ambiguous]]=await pool.execute('SELECT state,slot FROM kubernetes_executions WHERE id=?',[ambiguousId]);
  assert.equal(ambiguous.state,'CLEANUP_PENDING');
  assert.notEqual(ambiguous.slot,null,'An ambiguous claim must keep the lease');
  assert.equal(coldCreates,coldBeforeAmbiguous);
  await create().reconcile();
  assert.equal(warmPods.size,1,'Disabled reconciliation may drain idle Pods while preserving the unexpired claim');
  const claimedPod=[...warmPods.values()][0];
  assert.equal(claimedPod.metadata.labels[warmLanguage],'python');
  await pool.execute('UPDATE kubernetes_executions SET expires_at=UTC_TIMESTAMP(3) WHERE id=?',[ambiguousId]);
  await create().reconcile();
  assert.equal(warmPods.size,0);
  assert.equal(await countSlots(),0);
  const [[{total:remainingWarmRows}]]=await pool.query('SELECT COUNT(*) total FROM kubernetes_prewarm_slots');
  assert.equal(remainingWarmRows,0);
  console.log('Kubernetes execution persistence, two-slot admission, cancellation, cleanup retry, expiry, concurrent warm claims, ambiguous commit, disabled drain, and quota-aware demand scaling passed with isolated MySQL and a simulated API.');
}finally{await broker.close();await pool.end();}
