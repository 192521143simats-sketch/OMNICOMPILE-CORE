import {describe,expect,it,vi} from 'vitest';
import type {Pool} from 'mysql2/promise';
import type {DockerJob} from './docker-executor-schema.js';
import {KubernetesExecutionProvider} from './kubernetes-execution.js';
import {prewarmedManifest,prewarmLabel} from './kubernetes-manifests.js';
import {KubernetesPrewarmPool} from './kubernetes-prewarm.js';

describe('Kubernetes prewarm pod',()=>{
  it('has a bounded sandbox with private optional files and a runner readiness marker',()=>{
    const name='omni-warm-test';
    const image='fixture/runner@sha256:'+'1'.repeat(64);
    const pod=prewarmedManifest(name,'python',image,'sandbox');
    expect(pod.spec).toMatchObject({activeDeadlineSeconds:240,automountServiceAccountToken:false,
      restartPolicy:'Never',runtimeClassName:'sandbox'});
    expect(pod.spec.containers[0]).toMatchObject({image,command:['node','--import','tsx',
      'apps/coordinator/src/compiler-job.ts','--prewarmed','python',name,'240000'],
      readinessProbe:{exec:{command:['test','-f','/tmp/.omni-ready']}}});
    const sources=pod.spec.volumes[1]?.projected?.sources;
    expect(sources).toHaveLength(41);
    expect(sources?.map(source=>source.configMap.items[0]?.path)).toEqual([
      ...Array.from({length:40},(_,index)=>'chunks'+String(index).padStart(2,'0')),'commit.json'
    ]);
    expect(sources?.every(source=>source.configMap.optional&&source.configMap.name.startsWith(name+'-'))).toBe(true);
  });
});

const image='fixture/runner@sha256:'+'1'.repeat(64);
const images={c:image,python:image,java:image};
const runtime='sandbox';
const core='/api/v1/namespaces/fixtures';
const name='omni-warm-12345678-0000-4000-a000-000000000003';
const fixtureJob:DockerJob={kind:'task',language:'c',payload:{operation:'c_compile',sourceName:'main.c',source:'int main(void){return 0;}'}};

function fixture(){
  let pod:any={
    ...prewarmedManifest(name,'c',image,runtime),
    metadata:{name,uid:'pod-uid',labels:{[prewarmLabel]:'c'},creationTimestamp:new Date().toISOString()},
    status:{phase:'Running',conditions:[{type:'Ready',status:'True'}]},
  };
  let slot:any={
    language:'c',pod_name:name,pod_uid:'pod-uid',runtime_class:runtime,image,
    state:'IDLE',execution_id:null,idle_live:1,
  };
  let rejectDelete=false;
  let rejectCommit=false;
  let rejectClaimReply=false;
  let onCommit=()=>{};
  let latestExecution='';
  let cleanupLeaseExpired=false;
  const maps=new Map<string,any>();
  const executions=new Map<string,any>();
  const chunks=new Map<string,Buffer[]>();
  const creation=new Date(Date.now()-100).toISOString();
  const coldJobs=new Map<string,any>();
  const completePod=()=>{
    pod.status={phase:'Succeeded',containerStatuses:[{name:'runner',state:{terminated:{
      startedAt:creation,finishedAt:new Date().toISOString(),exitCode:0,
    }}}]};
  };
  const execute=vi.fn(async(sql:string,params:any[]=[])=>{
    const affected=(affectedRows=1)=>[{affectedRows}];
    if(sql.includes('FROM kubernetes_prewarm_slots')){
      if(sql.includes('DELETE FROM')){
        if(slot?.language===params[0]&&slot?.pod_name===params[1]&&slot?.state===params[2])slot=null;
        return affected();
      }
      if(sql.includes('WHERE pod_name=?'))return [slot?.pod_name===params[0]?[{...slot}]:[]];
      if(sql.includes('WHERE execution_id=?'))return [slot?.execution_id===params[0]?[{...slot}]:[]];
      if(sql.includes("state='IDLE'"))return [slot?.state==='IDLE'&&slot.idle_live?[{...slot}]:[]];
      return [slot&&!slot.execution_id?[{...slot}]:[]];
    }
    if(sql.includes('UPDATE kubernetes_prewarm_slots AS p')){
      if(slot?.state!=='IDLE'||!slot.idle_live)return affected(0);
      slot={...slot,state:'CLAIMED',execution_id:params[0]};
      if(rejectClaimReply)throw Error('lost claim acknowledgment');
      return affected();
    }
    if(sql.includes("SET state='RETIRING'")){
      if(slot?.state!==params[2]||slot.execution_id)return affected(0);
      slot={...slot,state:'RETIRING'};
      return affected();
    }
    if(sql.includes('INSERT INTO kubernetes_executions')){
      latestExecution=params[0];
      executions.set(latestExecution,{id:latestExecution,request_id:params[5],request_digest:params[6],state:'PROVISIONING',job_uid:null});
      return affected();
    }
    if(sql.includes("SET state='CANCEL_REQUESTED'")){
      executions.get(params[0]).state='CANCEL_REQUESTED';
      return affected();
    }
    if(sql.includes("SET state='RUNNING'")){
      const row=executions.get(params[0]);
      if(row.state!=='PROVISIONING')return affected(0);
      row.state='RUNNING';return affected();
    }
    if(sql.includes('SET job_uid=')){
      executions.get(params[1]).job_uid=params[0];return affected();
    }
    if(sql.includes('SELECT state FROM kubernetes_executions'))return [[executions.get(params[0])]];
    if(sql.includes("state='SUCCEEDED',finished_at")){
      const row=executions.get(params.at(-1));
      if(row.state!=='RUNNING')return affected(0);
      Object.assign(row,{state:'SUCCEEDED',finished_at:new Date(),receipt_digest:params[4],receipt_bytes:params[5],receipt_live:1});
      return affected();
    }
    if(sql.includes("state='CLEANUP_PENDING'")){
      const row=executions.get(params.at(-1));
      Object.assign(row,{state:'CLEANUP_PENDING',cleanup_outcome:params[0],finished_at:new Date()});
      return affected();
    }
    if(sql.includes('SET slot=NULL')){
      const row=executions.get(params.at(-1));
      Object.assign(row,{state:params[1],released:true});return affected();
    }
    if(sql.includes('SELECT id,job_uid,state,finished_at')){
      return [[...executions.values()].filter(row=>!row.released&&(cleanupLeaseExpired||row.finished_at&&row.state!=='CLEANUP_PENDING'))];
    }
    if(sql.includes('FROM kubernetes_executions WHERE request_id=?')){
      return [[...executions.values()].filter(row=>row.request_id===params[0])];
    }
    if(sql.includes('INSERT INTO kubernetes_result_chunks')){
      chunks.set(params[0],[...(chunks.get(params[0])??[]),params[2]]);
      return affected();
    }
    if(sql.includes('SELECT content FROM kubernetes_result_chunks')){
      return [(chunks.get(params[0])??[]).map(content=>({content}))];
    }
    throw Error('Unexpected SQL: '+sql);
  });
  const db={
    execute,
    getConnection:async()=>({execute,query:async()=>[[]],beginTransaction:async()=>{},
      commit:async()=>{},rollback:async()=>{},release:()=>{}}),
  } as unknown as Pool;
  const api=vi.fn(async(method:string,path:string,body?:any)=>{
    if(path.includes('/log?'))return '{"ok":true,"result":{"compiled":true}}';
    if(path.includes('/configmaps?')){
      const offset=Number(new URLSearchParams(path.split('?')[1]).get('continue')??'0');
      const items=[...maps.values()].slice(offset,offset+8);
      return {items,metadata:{continue:offset+8<maps.size?String(offset+8):undefined}};
    }
    if(path.endsWith('/configmaps')&&method==='POST'){
      const commit=body.metadata.name.endsWith('-commit');
      if(commit&&rejectCommit)throw Error('missing commit');
      const map={...body,metadata:{...body.metadata,uid:body.metadata.name+'-uid'}};
      if(body.metadata.ownerReferences[0].kind==='Pod')maps.set(body.metadata.name,map);
      if(commit){onCommit();completePod();}
      return map;
    }
    if(method==='DELETE'&&path.includes('/configmaps/')){
      const map=maps.get(path.split('/').at(-1)!);
      if(map?.metadata.uid===body.preconditions.uid)maps.delete(map.metadata.name);
      return null;
    }
    if(path===core+'/pods/'+name){
      if(method==='GET')return pod;
      if(method==='DELETE'){
        if(rejectDelete)throw Error('pod deletion failed');
        if(pod?.metadata.uid===body.preconditions.uid)pod=null;
        return null;
      }
    }
    if(path.endsWith('/jobs')&&method==='POST'){
      const created={...body,metadata:{...body.metadata,uid:'job-uid',creationTimestamp:creation},status:{succeeded:1}};
      coldJobs.set(body.metadata.name,created);return created;
    }
    if(path.includes('/jobs/')){
      const jobName=path.split('/').at(-1)!;
      if(method==='DELETE')coldJobs.delete(jobName);
      return coldJobs.get(jobName)??null;
    }
    if(path.includes('/pods?limit=12'))return {items:pod?[pod]:[]};
    if(path.includes('/pods?')){
      const job=[...coldJobs.values()][0];
      return {items:[{metadata:{name:'cold-pod',ownerReferences:[{kind:'Job',uid:job.metadata.uid}]},status:{
        containerStatuses:[{name:'runner',state:{terminated:{startedAt:creation,finishedAt:new Date().toISOString()}}}],
      }}]};
    }
    throw Error('Unexpected API: '+method+' '+path);
  });
  const provider=(enabled=true)=>new KubernetesExecutionProvider(db,api,'fixtures',runtime,images,enabled);
  const pool=(enabled=true)=>new KubernetesPrewarmPool(db,api,core,runtime,images,enabled);
  return {
    api,execute,provider,pool,maps,
    get pod(){return pod;}, get slot(){return slot;}, get execution(){return executions.get(latestExecution);},
    get executionId(){return latestExecution;},
    forgetSlot(){slot=null;},
    expire(){slot.idle_live=0;}, expireLease(){cleanupLeaseExpired=true;},
    failDelete(){rejectDelete=true;}, restoreDelete(){rejectDelete=false;},
    failCommit(){rejectCommit=true;}, failClaimReply(){rejectClaimReply=true;},
    afterCommit(callback:()=>void){onCommit=callback;},
  };
}

const freshSignal=()=>new AbortController().signal;

describe('Durable Kubernetes prewarm handoff',()=>{
  it('allows only one broker to claim the same ready Pod',async()=>{
    const f=fixture();
    const claims=await Promise.all(['one','two'].map(id=>f.pool().claim(id,'c',freshSignal())));
    expect(claims.filter(Boolean)).toEqual([{name,uid:'pod-uid',language:'c'}]);
    expect(f.slot).toMatchObject({execution_id:'one',state:'CLAIMED'});
  });

  it('skips idle expiry, expired Pod lifetime, and missing readiness',async()=>{
    const f=fixture();
    f.pod.status.conditions=[];
    await expect(f.pool().claim('one','c',freshSignal())).resolves.toBeUndefined();
    f.pod.status.conditions=[{type:'Ready',status:'True'}];
    f.pod.metadata.creationTimestamp=new Date(Date.now()-129_000).toISOString();
    await expect(f.pool().claim('one','c',freshSignal())).resolves.toBeUndefined();
    f.pod.metadata.creationTimestamp=new Date().toISOString();
    f.expire();
    await expect(f.pool().claim('one','c',freshSignal())).resolves.toBeUndefined();
  });

  it('publishes all 40 immutable chunks and then an immutable commit owned by the Pod',async()=>{
    const f=fixture();
    const executionId='12345678-0000-4000-a000-000000000001';
    const claim=await f.pool().claim(executionId,'c',freshSignal());
    expect(claim).toBeDefined();
    const bytes=Buffer.alloc(24_000_000,17);
    await f.pool().publish(claim!,executionId,bytes,600_000,freshSignal());
    const maps=[...f.maps.values()];
    expect(maps).toHaveLength(41);
    expect(maps.every(map=>map.immutable&&map.metadata.ownerReferences[0].uid==='pod-uid')).toBe(true);
    expect(maps[39].metadata.name).toContain('chunk-39');
    expect(maps[40].metadata.name).toContain('commit');
    expect(JSON.parse(Buffer.from(maps[40].binaryData.payload,'base64').toString())).toMatchObject({
      podId:name,executionId,language:'c',chunkCount:40,byteLength:24_000_000,
    });
  });

  it('persists the receipt before cleanup and replays it through a restarted broker',async()=>{
    const f=fixture();
    const requestId='12345678-0000-4000-a000-000000000002';
    await expect(f.provider().run(fixtureJob,freshSignal(),undefined,requestId)).resolves.toEqual({compiled:true});
    expect(f.execution).toMatchObject({state:'SUCCEEDED',released:true,receipt_bytes:17});
    expect(f.slot).toBeNull();
    expect(f.maps.size).toBe(0);
    expect(f.api.mock.calls.find(([method,path])=>method==='DELETE'&&path===core+'/pods/'+name)?.[2])
      .toMatchObject({preconditions:{uid:'pod-uid'}});
    const calls=f.api.mock.calls.length;
    await expect(f.provider(false).run(fixtureJob,freshSignal(),undefined,requestId)).resolves.toEqual({compiled:true});
    expect(f.api.mock.calls).toHaveLength(calls);
  });

  it('holds an ambiguous claim and never provisions a cold Job for that execution',async()=>{
    const f=fixture();
    f.failClaimReply();
    await expect(f.provider().run(fixtureJob,freshSignal())).rejects.toThrow('lost claim acknowledgment');
    expect(f.api.mock.calls.some(([method,path])=>method==='POST'&&path.endsWith('/jobs'))).toBe(false);
    expect(f.slot).toMatchObject({state:'CLAIMED'});
    expect(f.execution).toMatchObject({state:'CLEANUP_PENDING'});
    f.expireLease();
    await f.provider(false).reconcile();
    expect(f.slot).toBeNull();
  });

  it('quarantines a failed commit through the lease and cleans owned chunks after restart',async()=>{
    const f=fixture();
    f.failCommit();
    await expect(f.provider().run(fixtureJob,freshSignal())).rejects.toThrow('missing commit');
    expect(f.pod).toBeNull();
    expect(f.maps.size).toBe(1);
    expect(f.slot).toMatchObject({state:'CLAIMED'});
    expect(f.execution).toMatchObject({state:'CLEANUP_PENDING'});
    await f.provider(false).reconcile();
    expect(f.slot).toMatchObject({state:'CLAIMED'});
    f.expireLease();
    await f.provider(false).reconcile();
    expect(f.slot).toBeNull();
    expect(f.maps.size).toBe(0);
    expect(f.execution.released).toBe(true);
  });

  it('cleans a cancelled committed execution without reading its result',async()=>{
    const f=fixture();
    const broker=f.provider();
    let cancel:Promise<boolean>|undefined;
    f.afterCommit(()=>{cancel=broker.cancel(f.executionId);});
    await expect(broker.run(fixtureJob,freshSignal())).rejects.toThrow();
    await expect(cancel).resolves.toBe(true);
    expect(f.execution.state).toBe('CANCELLED');
    expect(f.api.mock.calls.some(([,path])=>path.includes('/log?'))).toBe(false);
    f.expireLease();
    await f.provider(false).reconcile();
    expect(f.slot).toBeNull();
  });

  it('holds a claimed slot through UID mismatch and retries cleanup after Pod deletion errors',async()=>{
    const f=fixture();
    await f.pool().claim('one','c',freshSignal());
    f.pod.metadata.uid='different';
    await expect(f.pool().finish('one',false)).rejects.toThrow('ownership');
    expect(f.api.mock.calls.some(([method])=>method==='DELETE')).toBe(false);
    expect(f.slot).toMatchObject({state:'CLAIMED'});
    f.pod.metadata.uid='pod-uid';
    f.failDelete();
    await expect(f.pool().finish('one',false)).rejects.toThrow('pod deletion failed');
    expect(f.slot).toMatchObject({state:'CLAIMED'});
    f.restoreDelete();
    await expect(f.pool().finish('one',false)).resolves.toBe(true);
    expect(f.slot).toBeNull();
  });

  it('sweeps a late-created expired orphan by UID without deleting a fresh orphan',async()=>{
    const f=fixture();
    f.forgetSlot();
    await f.provider(false).reconcile();
    expect(f.pod).not.toBeNull();
    f.pod.metadata.creationTimestamp=new Date(Date.now()-301_000).toISOString();
    await f.provider(false).reconcile();
    expect(f.pod).toBeNull();
  });

  it('runs the original cold Job without touching the prewarm pool when disabled',async()=>{
    const f=fixture();
    await expect(f.provider(false).run(fixtureJob,freshSignal())).resolves.toEqual({compiled:true});
    expect(f.execute.mock.calls.some(([sql])=>sql.includes('kubernetes_prewarm_slots'))).toBe(false);
    expect(f.api.mock.calls.some(([method,path])=>method==='POST'&&path.endsWith('/jobs'))).toBe(true);
    expect(f.slot).toMatchObject({state:'IDLE'});
    await f.provider(false).reconcile();
    expect(f.slot).toBeNull();
  });
});

describe('Prewarm cleanup pagination',()=>{
  it('follows empty continued ConfigMap pages before confirming cleanup',async()=>{
    const f=fixture();
    await f.pool().claim('one','c',freshSignal());
    const original=f.api.getMockImplementation()!;
    let pages=0;
    f.api.mockImplementation(async(method,path,body)=>{
      if(method==='GET'&&path.includes('/configmaps?')){
        pages++;
        return {items:[],metadata:{continue:pages===1?'next-page':''}};
      }
      return original(method,path,body);
    });
    await expect(f.pool().finish('one',false)).resolves.toBe(true);
    expect(pages).toBe(2);
    expect(f.slot).toBeNull();
  });

  it('drains orphan Pods across multiple pages using their own UIDs',async()=>{
    const f=fixture();
    f.forgetSlot();
    const pods=Array.from({length:14},(_,index)=>{
      const podName='omni-warm-12345678-0000-4000-a000-'+String(index).padStart(12,'0');
      return {...f.pod,metadata:{...f.pod.metadata,name:podName,uid:'uid-'+index,
        creationTimestamp:new Date(Date.now()-301_000).toISOString()},
        spec:{...f.pod.spec,containers:[{...f.pod.spec.containers[0],command:[
          'node','--import','tsx','apps/coordinator/src/compiler-job.ts','--prewarmed','c',podName,'240000'
        ]}]}};
    });
    const removed:string[]=[];
    const original=f.api.getMockImplementation()!;
    f.api.mockImplementation(async(method,path,body)=>{
      if(method==='GET'&&path.includes('/pods?limit=12')){
        const next=path.includes('continue=second');
        return {items:next?pods.slice(12):pods.slice(0,12),metadata:{continue:next?'':'second'}};
      }
      if(method==='DELETE'&&path.includes('/pods/')){
        removed.push(body.preconditions.uid);
        return null;
      }
      return original(method,path,body);
    });
    await f.pool(false).reconcile();
    expect(removed).toEqual(pods.map(pod=>pod.metadata.uid));
  });
});
