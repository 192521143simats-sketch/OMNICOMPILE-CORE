import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import mysql from 'mysql2/promise';
import {KubernetesExecutionProvider} from '../apps/coordinator/src/kubernetes-execution.ts';
import {assertIsolatedTarget,verifyIsolatedCoordinator} from './Integration-Target.mjs';

const target=assertIsolatedTarget();
await verifyIsolatedCoordinator(target);
const pool=mysql.createPool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),database:target.database,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
const jobs=new Map();
const label='omnicompile.io/execution-id';
let complete=true;
let failureReason;
let runnerState={terminated:{startedAt:"2026-01-01T00:00:00Z",finishedAt:"2026-01-01T00:00:03Z"}};
let observedJob;
let jobReads=0;
let podReads=0;
const failedDeletes=new Set();
let deferDeletion=false;
const api=async(method,path,body)=>{
  const name=path.split('/').at(-1);
  if(method==='POST'&&name==='jobs'){
    assert.equal(body.spec.template.spec.automountServiceAccountToken,false);
    assert.equal(body.spec.template.spec.runtimeClassName,'sandbox-test');
    assert.equal(body.spec.activeDeadlineSeconds,105);
    const record={metadata:{...body.metadata,uid:randomUUID(),creationTimestamp:'2025-12-31T23:59:58Z'}};
    jobs.set(record.metadata.name,record);
    observedJob=record.metadata.labels[label];
    return record;
  }
  if(method==='POST'&&name==='configmaps'){
    assert.equal(body.immutable,true);
    const owner=body.metadata.ownerReferences[0];
    assert.equal(jobs.get(owner.name)?.metadata.uid,owner.uid);
    assert.equal(JSON.parse(Buffer.from(body.binaryData.payload,'base64')).language,'python');
    return {};
  }
  if(path.includes('/pods?')){
    podReads++;
    const id=decodeURIComponent(path.split('=').at(-1)).split('=').at(-1);
    return {items:[{metadata:{name:'foreign-pod',ownerReferences:[{kind:'Job',uid:'foreign'}]},status:{containerStatuses:[{name:'runner',state:{running:{startedAt:'2026-01-01T00:00:00Z'}}}]}},{metadata:{name:'test-pod',ownerReferences:[{kind:'Job',uid:jobs.get('omni-'+id)?.metadata.uid}]},status:{containerStatuses:[{name:'runner',state:runnerState}]}}]};
  }
  if(path.includes('/log?'))return JSON.stringify({ok:true,result:{stdout:'fixture'}});
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
const create=()=>new KubernetesExecutionProvider(pool,api,'fixture','sandbox-test',{c:image,python:image,java:image});
const job={kind:'execute',language:'python',payload:{language:'python',sourceName:'main.py',generatedSource:'print(42)',input:''}};
const provider=create();
const start=()=>provider.run(job,new AbortController().signal);
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
try{
  await provider.ready();
  assert.deepEqual(await start(),{stdout:'fixture'});
  assert.equal(await countSlots(),0,'A confirmed deletion should release its slot without waiting for reconciliation');
  await provider.reconcile();
  const [completed]=await create().list();
  assert.equal(completed.state,'SUCCEEDED');
  assert.equal(completed.runnerDurationMs,3000);
  assert.equal(completed.provisioningDurationMs,2000);
  assert.equal(completed.capacityRetryWaitMs,null);
  deferDeletion=true;
  assert.deepEqual(await start(),{stdout:'fixture'});
  assert.equal(await countSlots(),1,'A terminating Job should still hold its slot');
  await provider.reconcile();
  assert.equal(await countSlots(),1);
  jobs.delete('omni-'+observedJob);
  deferDeletion=false;
  await provider.reconcile();
  assert.equal(await countSlots(),0);
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
  runnerState={running:{startedAt:'2026-01-01T00:00:00Z'}};
  const first=start(),second=start();
  const settled=Promise.allSettled([first,second]);
  const rows=await running();
  await assert.rejects(start(),{statusCode:429});
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
  for(const row of rows)assert.equal((await restarted.list()).find(item=>item.id===row.id).state,'CANCELLED');
  const [[{total}]]=await pool.query('SELECT COUNT(*) total FROM kubernetes_executions WHERE slot IS NOT NULL');
  assert.equal(total,0);
  const expired=randomUUID();
  await pool.execute("INSERT INTO kubernetes_executions(id,slot,language,kind,state,expires_at) VALUES(?,1,'python','execute','PROVISIONING',UTC_TIMESTAMP(3))",[expired]);
  await restarted.reconcile();
  assert.equal((await restarted.list()).find(row=>row.id===expired).state,'TIMED_OUT');
  console.log('Kubernetes execution persistence, two-slot admission, cancellation, cleanup retry and expiry passed with isolated MySQL and a simulated API.');
}finally{await pool.end();}
