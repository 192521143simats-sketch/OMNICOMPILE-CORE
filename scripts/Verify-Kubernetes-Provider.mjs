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
const failedDeletes=new Set();
const api=async(method,path,body)=>{
  const name=path.split('/').at(-1);
  if(method==='POST'&&name==='jobs'){
    assert.equal(body.spec.template.spec.automountServiceAccountToken,false);
    assert.equal(body.spec.template.spec.runtimeClassName,'sandbox-test');
    assert.equal(body.spec.activeDeadlineSeconds,105);
    const record={metadata:{...body.metadata,uid:randomUUID()}};
    jobs.set(record.metadata.name,record);
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
    const id=decodeURIComponent(path.split('=').at(-1)).split('=').at(-1);
    return {items:[{metadata:{name:'test-pod',ownerReferences:[{kind:'Job',uid:jobs.get('omni-'+id)?.metadata.uid}]}}]};
  }
  if(path.includes('/log?'))return JSON.stringify({ok:true,result:{stdout:'fixture'}});
  if(method==='GET'&&name==='jobs?limit=1')return {items:[]};
  if(method==='GET'){
    const record=jobs.get(name);
    return record?{...record,status:{succeeded:complete?1:0,conditions:failureReason?[{type:'Failed',status:'True',reason:failureReason}]:[]}}:null;
  }
  if(method==='DELETE'){
    assert.equal(body.preconditions.uid,jobs.get(name)?.metadata.uid);
    assert.equal(body.propagationPolicy,'Foreground');
    if(failedDeletes.has(name))throw new Error('Fixture deletion failure');
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
  await provider.reconcile();
  assert.equal((await create().list())[0].state,'SUCCEEDED');
  complete=false;
  failureReason='DeadlineExceeded';
  await assert.rejects(start(),/execution deadline/i);
  await provider.reconcile();
  const [deadline]=await provider.list();
  assert.equal(deadline.state,'TIMED_OUT');
  assert.equal(jobs.size,0);
  failureReason=undefined;
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
