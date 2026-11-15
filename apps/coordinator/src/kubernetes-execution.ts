import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {request} from 'node:https';
import {setTimeout as delay} from 'node:timers/promises';
import type {Pool,ResultSetHeader,RowDataPacket} from 'mysql2/promise';
import type {DockerJob} from './docker-executor-schema.js';

export type ClusterApi = (method:string,path:string,body?:unknown,signal?:AbortSignal)=>Promise<any>;
const account='/var/run/secrets/kubernetes.io/serviceaccount';
const label='omnicompile.io/execution-id';
const chunkBytes=600_000;
const maxPayload=24_000_000;
const maxReceiptBytes=32_000_000;
const receiptSlots=Array.from({length:8},(_,index)=>index+1);
const digest=(data:Buffer)=>createHash('sha256').update(data).digest('hex');
const requestError=(statusCode:number,errorCode:string,message:string)=>Object.assign(new Error(message),{statusCode,errorCode});

function canonicalJson(value:unknown):string{
  if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';
  if(value!==null&&typeof value==='object'){
    const record=value as Record<string,unknown>;
    return '{'+Object.keys(record).sort().filter(key=>record[key]!==undefined)
      .map(key=>JSON.stringify(key)+':'+canonicalJson(record[key])).join(',')+'}';
  }
  return JSON.stringify(value);
}

export function inClusterApi():ClusterApi {
  const hostname=process.env.KUBERNETES_SERVICE_HOST;
  if(!hostname)throw new Error('Kubernetes service is unavailable.');
  return async(method,path,body,signal)=>{
    const bounded=AbortSignal.any([AbortSignal.timeout(8000),...(signal?[signal]:[])]);
    const [token,ca]=await Promise.all([readFile(account+'/token','utf8'),readFile(account+'/ca.crt')]);
    const payload=body===undefined?undefined:JSON.stringify(body);
    return new Promise((resolve,reject)=>{
      const req=request({hostname,port:process.env.KUBERNETES_SERVICE_PORT_HTTPS??443,method,path,ca,signal:bounded,
        headers:{Authorization:'Bearer '+token.trim(),'Content-Type':'application/json',
          ...(payload===undefined?{}:{'Content-Length':Buffer.byteLength(payload)})}},response=>{
        const chunks:Buffer[]=[];let bytes=0;
        response.on('error',reject);
        response.on('data',(chunk:Buffer)=>{
          bytes+=chunk.length;
          if(bytes>32_000_000){req.destroy(new Error('Kubernetes response exceeds its limit.'));return;}
          chunks.push(chunk);
        });
        response.on('end',()=>{
          if(response.statusCode===404){resolve(null);return;}
          if((response.statusCode??500)>=300){reject(new Error('Kubernetes request failed.'));return;}
          const value=Buffer.concat(chunks).toString('utf8');
          try{resolve(path.includes('/log?')?value:JSON.parse(value));}catch(error){reject(error);}
        });
      });
      req.on('error',reject);
      req.end(payload);
    });
  };
}

export function executionManifest(id:string,image:string,runtimeClassName:string,count:number){
  if(!/^[a-z0-9][a-z0-9._:/-]*@sha256:[a-f0-9]{64}$/.test(image))throw new Error('Execution image must be digest pinned.');
  if(!/^[a-z0-9][a-z0-9.-]{0,62}$/.test(runtimeClassName))throw new Error('A sandbox RuntimeClass is required.');
  if(!Number.isInteger(count)||count<1||count>40)throw new Error('Invalid execution input size.');
  const name='omni-'+id;
  return {
    apiVersion:'batch/v1',kind:'Job',metadata:{name,labels:{[label]:id}},
    spec:{backoffLimit:0,activeDeadlineSeconds:105,ttlSecondsAfterFinished:300,parallelism:1,completions:1,
      template:{metadata:{labels:{[label]:id,'app':'omnicompile-execution'}},spec:{
        runtimeClassName,restartPolicy:'Never',automountServiceAccountToken:false,enableServiceLinks:false,
        terminationGracePeriodSeconds:2,securityContext:{runAsNonRoot:true,runAsUser:1000,runAsGroup:1000,fsGroup:1000,seccompProfile:{type:'RuntimeDefault'}},
        containers:[{name:'runner',image,command:['/bin/sh','-ec','cat /payload/* | node --import tsx apps/coordinator/src/compiler-job.ts'],
          securityContext:{readOnlyRootFilesystem:true,allowPrivilegeEscalation:false,capabilities:{drop:['ALL']}},
          resources:{requests:{cpu:'250m',memory:'256Mi','ephemeral-storage':'128Mi'},limits:{cpu:'1',memory:'512Mi','ephemeral-storage':'256Mi'}},
          volumeMounts:[{name:'input',mountPath:'/payload',readOnly:true},{name:'tmp',mountPath:'/tmp'}]}],
        volumes:[{name:'tmp',emptyDir:{medium:'Memory',sizeLimit:'128Mi'}},
          {name:'input',projected:{sources:Array.from({length:count},(_,i)=>({configMap:{name:name+'-'+i,
            items:[{key:'payload',path:String(i).padStart(2,'0')}]}}))}}],
      }},
    },
  };
}

type ExecutionIdentity={id:string;job_uid:string|null};
type ExecutionRow=RowDataPacket&ExecutionIdentity;
export const kubernetesFailureReasons=[
  'PROVISIONING_FAILED','EXECUTION_FAILED','RESULT_COLLECTION_FAILED','DEADLINE_EXCEEDED','CANCELLED'
] as const;
type FailureReason=(typeof kubernetesFailureReasons)[number];
export class KubernetesExecutionProvider {
  private readonly jobs:string;
  private readonly core:string;
  private readonly pending=new Map<string,AbortController>();
  private reconciliation:Promise<void>|undefined;
  constructor(private readonly pool:Pool,private readonly api:ClusterApi,namespace:string,
    private readonly runtime:string,private readonly images:Record<DockerJob['language'],string>){
    if(!/^[a-z0-9][a-z0-9-]{0,62}$/.test(namespace))throw new Error('Invalid execution namespace.');
    this.jobs='/apis/batch/v1/namespaces/'+namespace+'/jobs';
    this.core='/api/v1/namespaces/'+namespace;
    for(const image of Object.values(images))executionManifest(randomUUID(),image,runtime,1);
  }

  async ready(){
    const [[row],cluster]=await Promise.all([
      this.pool.query<RowDataPacket[]>('SELECT 1 FROM kubernetes_executions LIMIT 1'),
      this.api('GET',this.jobs+'?limit=1',undefined,AbortSignal.timeout(3500))
    ]);
    if(!Array.isArray(cluster?.items)||!Array.isArray(row))throw new Error('Execution dependencies are unavailable.');
  }

  async list(){
    const [rows]=await this.pool.query<RowDataPacket[]>(`SELECT id,language,kind,state,created_at createdAt,
      finished_at finishedAt,runner_duration_ms runnerDurationMs,
      provisioning_duration_ms provisioningDurationMs,scheduling_duration_ms schedulingDurationMs,
      container_startup_duration_ms containerStartupDurationMs,capacity_retry_wait_ms capacityRetryWaitMs,
      failure_reason failureReason
      FROM kubernetes_executions ORDER BY created_at DESC,id DESC LIMIT 50`);
    return rows;
  }

  async cancel(id:string){
    const [result]=await this.pool.execute<ResultSetHeader>(`UPDATE kubernetes_executions SET state='CANCEL_REQUESTED'
      WHERE id=? AND state IN ('PROVISIONING','RUNNING')`,[id]);
    if(result.affectedRows!==1)return false;
    this.pending.get(id)?.abort();
    return true;
  }

  private async replay(requestId:string,requestDigest:string){
    const connection=await this.pool.getConnection();
    try{
      await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await connection.beginTransaction();
      const [[row]]=await connection.execute<RowDataPacket[]>(`SELECT id,request_digest,receipt_digest,receipt_bytes,
        receipt_expires_at>UTC_TIMESTAMP(3) AS receipt_live,state,finished_at
        FROM kubernetes_executions WHERE request_id=?`,[requestId]);
      if(!row)return undefined;
      if(row.request_digest!==requestDigest)throw requestError(409,'EXECUTION_REQUEST_CONFLICT','The execution request key was used with different input.');
      if(!row.finished_at)throw requestError(409,'EXECUTION_REQUEST_PENDING','The execution request is still pending.');
      if(!row.receipt_live||!row.receipt_digest)throw requestError(410,'EXECUTION_RECEIPT_UNAVAILABLE','The execution result receipt is unavailable.');
      const [chunks]=await connection.execute<RowDataPacket[]>(
        'SELECT content FROM kubernetes_result_chunks WHERE execution_id=? ORDER BY chunk_number',[row.id]);
      const bytes=Buffer.concat(chunks.map(chunk=>chunk.content));
      if(bytes.length!==row.receipt_bytes||digest(bytes)!==row.receipt_digest)throw new Error('Execution receipt integrity check failed.');
      return {result:JSON.parse(bytes.toString('utf8'))};
    }finally{
      try{await connection.rollback();}finally{connection.release();}
    }
  }

  async run(job:DockerJob,signal:AbortSignal,capacityRetryHeader?:string|string[],requestId?:string){
    // Optional authenticated caller telemetry; malformed/missing values remain unknown.
    const capacityRetryWaitMs=typeof capacityRetryHeader==='string'&&/^(0|[1-9][0-9]{0,5})$/.test(capacityRetryHeader)&&Number(capacityRetryHeader)<=125_000?Number(capacityRetryHeader):null;
    signal.throwIfAborted();
    const input=Buffer.from(JSON.stringify(job));
    if(input.length>maxPayload)throw new Error('Execution input exceeds its limit.');
    const requestDigest=requestId?digest(Buffer.from(canonicalJson(job))):null;
    if(requestId&&requestDigest){
      const cached=await this.replay(requestId,requestDigest);
      if(cached)return cached.result;
    }
    const id=randomUUID();
    const count=Math.ceil(input.length/chunkBytes);
    const manifest=executionManifest(id,this.images[job.language],this.runtime,count);
    let admitted=false;
    admission: for(const slot of [1,2])for(const receiptSlot of requestId?receiptSlots:[null]){
      try{
        await this.pool.execute(`INSERT INTO kubernetes_executions(id,slot,language,kind,state,expires_at,capacity_retry_wait_ms,
          request_id,request_digest,receipt_slot)
          VALUES(?,?,?,?,'PROVISIONING',TIMESTAMPADD(SECOND,150,UTC_TIMESTAMP(3)),?,?,?,?)`,
          [id,slot,job.language,job.kind,capacityRetryWaitMs,requestId??null,requestDigest,receiptSlot]);
        admitted=true;break admission;
      }catch(error){if((error as {code?:string}).code!=='ER_DUP_ENTRY')throw error;}
    }
    if(!admitted&&requestId&&requestDigest){
      const cached=await this.replay(requestId,requestDigest);
      if(cached)return cached.result;
    }
    if(!admitted)throw Object.assign(new Error('Execution service is at capacity.'),{statusCode:429});
    const abort=new AbortController();
    this.pending.set(id,abort);
    const bounded=AbortSignal.any([signal,abort.signal,AbortSignal.timeout(112_000)]);
    const name=manifest.metadata.name;
    let uid:string|undefined;
    let createAttempted=false;
    let outcome='FAILED';
    let failureReason:FailureReason|null='PROVISIONING_FAILED';
    try{
      bounded.throwIfAborted();
      createAttempted=true;
      const created=await this.api('POST',this.jobs,manifest,bounded);
      uid=created?.metadata?.uid;
      if(!uid)throw new Error('Execution Job identity is missing.');
      await this.pool.execute('UPDATE kubernetes_executions SET job_uid=? WHERE id=?',[uid,id]);
      for(let i=0;i<count;i++){
        await this.api('POST',this.core+'/configmaps',{
          apiVersion:'v1',kind:'ConfigMap',
          metadata:{name:name+'-'+i,labels:{[label]:id},ownerReferences:[{apiVersion:'batch/v1',kind:'Job',name,uid}]},
          immutable:true,binaryData:{payload:input.subarray(i*chunkBytes,(i+1)*chunkBytes).toString('base64')},
        },bounded);
      }
      const selector=encodeURIComponent(label+'='+id);
      let pod:any;
      let runnerStarted=false;
      for(;;){
        bounded.throwIfAborted();
        const [rows]=await this.pool.execute<RowDataPacket[]>('SELECT state FROM kubernetes_executions WHERE id=?',[id]);
        if(rows[0]?.state==='CANCEL_REQUESTED'){abort.abort();bounded.throwIfAborted();}
        const state=await this.api('GET',this.jobs+'/'+name,undefined,bounded);
        if(state?.metadata?.uid!==uid)throw new Error('Execution Job identity changed.');
        const failure=state.status?.conditions?.find((condition:{type:string;status:string;reason?:string})=>
          condition.type==='Failed'&&condition.status==='True');
        if(failure?.reason==='DeadlineExceeded'){
          outcome='TIMED_OUT';
          failureReason='DEADLINE_EXCEEDED';
          throw new Error('The Kubernetes Job exceeded its execution deadline.');
        }
        const succeeded=state.status?.succeeded===1;
        if(succeeded)failureReason='RESULT_COLLECTION_FAILED';
        // Once the runner starts, follow the Job until fresh Pod data is needed for results.
        if(!runnerStarted||succeeded){
          const pods=await this.api('GET',this.core+'/pods?labelSelector='+selector,undefined,bounded);
          pod=pods?.items?.find((item:any)=>item.metadata?.ownerReferences?.some((owner:any)=>owner.kind==='Job'&&owner.uid===uid));
          const runner=pod?.status?.containerStatuses?.find((container:{name:string})=>container.name==='runner');
          const startedAt=runner?.state?.running?.startedAt??runner?.state?.terminated?.startedAt;
          if(!runnerStarted&&Number.isFinite(Date.parse(startedAt))){
            bounded.throwIfAborted();
            await this.pool.execute("UPDATE kubernetes_executions SET state='RUNNING' WHERE id=? AND state='PROVISIONING'",[id]);
            runnerStarted=true;
            if(!succeeded)failureReason='EXECUTION_FAILED';
          }
        }
        if(failure)throw new Error('Execution Job failed.');
        if(succeeded){
          if(!runnerStarted)throw new Error('Execution runner start evidence is missing.');
          break;
        }
        await delay(750,undefined,{signal:bounded});
      }
      if(!pod?.metadata?.name)throw new Error('Execution Pod is missing.');
      const terminated=pod.status?.containerStatuses?.find((container:{name:string})=>container.name==='runner')?.state?.terminated;
      const startedAt=Date.parse(terminated?.startedAt);
      const createdAt=Date.parse(created.metadata.creationTimestamp);
      const provisioning=startedAt-createdAt;
      const provisioningDurationMs=Number.isInteger(provisioning)&&provisioning>=0&&provisioning<=0xffffffff?provisioning:null;
      const scheduled=pod.status?.conditions?.find((condition:{type:string;status:string;lastTransitionTime?:string})=>
        condition.type==='PodScheduled'&&condition.status==='True');
      const scheduledAt=Date.parse(scheduled?.lastTransitionTime);
      // Clock skew or absent condition history can prevent a consistent split.
      const schedulingDurationMs=provisioningDurationMs!==null&&scheduledAt>=createdAt&&scheduledAt<=startedAt
        ? scheduledAt-createdAt : null;
      const containerStartupDurationMs=schedulingDurationMs===null?null:startedAt-scheduledAt;
      const duration=Date.parse(terminated?.finishedAt)-startedAt;
      const runnerDurationMs=Number.isInteger(duration)&&duration>=0&&duration<=0xffffffff?duration:null;
      const output=await this.api('GET',this.core+'/pods/'+encodeURIComponent(pod.metadata.name)+'/log?container=runner&limitBytes=32000000',undefined,bounded);
      let value;
      try{value=JSON.parse(output);}catch{throw new Error('The execution result could not be read.');}
      if(value?.ok===false){
        failureReason='EXECUTION_FAILED';
        throw Object.assign(new Error(typeof value.error?.message==='string'?value.error.message:'The isolated compiler job failed.'),{diagnostics:value.error?.diagnostics});
      }
      if(value?.ok!==true||!Object.hasOwn(value,'result'))throw new Error('The execution result is invalid.');
      bounded.throwIfAborted();
      const completeSql=`UPDATE kubernetes_executions SET
        state='SUCCEEDED',finished_at=UTC_TIMESTAMP(3),runner_duration_ms=?,provisioning_duration_ms=?,
        scheduling_duration_ms=?,container_startup_duration_ms=?`;
      const timing=[runnerDurationMs,provisioningDurationMs,schedulingDurationMs,containerStartupDurationMs];
      if(requestId){
        const bytes=Buffer.from(JSON.stringify(value.result));
        if(bytes.length>maxReceiptBytes)throw new Error('Execution receipt exceeds its size limit.');
        const connection=await this.pool.getConnection();
        try{
          await connection.beginTransaction();
          const [completed]=await connection.execute<ResultSetHeader>(completeSql+`,
            receipt_digest=?,receipt_bytes=?,receipt_expires_at=TIMESTAMPADD(MINUTE,5,UTC_TIMESTAMP(3))
            WHERE id=? AND state='RUNNING'`,[...timing,digest(bytes),bytes.length,id]);
          if(completed.affectedRows!==1){abort.abort();throw new Error('Execution was cancelled.');}
          for(let offset=0;offset<bytes.length;offset+=chunkBytes){
            await connection.execute('INSERT INTO kubernetes_result_chunks(execution_id,chunk_number,content) VALUES(?,?,?)',
              [id,offset/chunkBytes,bytes.subarray(offset,offset+chunkBytes)]);
          }
          bounded.throwIfAborted();
          await connection.commit();
        }catch(error){
          await connection.rollback();
          throw error;
        }finally{connection.release();}
      }else{
        const [completed]=await this.pool.execute<ResultSetHeader>(completeSql+' WHERE id=? AND state=\'RUNNING\'',[...timing,id]);
        if(completed.affectedRows!==1){abort.abort();throw new Error('Execution was cancelled.');}
      }
      outcome='SUCCEEDED';
      failureReason=null;
      return value.result;
    }catch(error){
      if(abort.signal.aborted||signal.aborted){
        outcome='CANCELLED';
        failureReason='CANCELLED';
      }else if(bounded.aborted){
        outcome='TIMED_OUT';
        failureReason='DEADLINE_EXCEEDED';
      }
      throw error;
    }finally{
      try{await this.finish({id,job_uid:uid??null},outcome,failureReason,createAttempted&&!uid);}
      finally{this.pending.delete(id);}
    }
  }

  private async finish(row:ExecutionIdentity,outcome:string,failureReason:FailureReason|null,holdIfMissing=false){
    const path=this.jobs+'/omni-'+row.id;
    try{
      let job=await this.api('GET',path);
      if(job){
        const uid=job.metadata?.uid;
        if(!uid||job.metadata?.labels?.[label]!==row.id||(row.job_uid&&uid!==row.job_uid))
          throw new Error('Execution Job ownership could not be verified.');
        if(!job.metadata.deletionTimestamp){
          await this.api('DELETE',path,{apiVersion:'v1',kind:'DeleteOptions',propagationPolicy:'Foreground',preconditions:{uid}});
          job=await this.api('GET',path);
        }
        if(job!==null){
          // Foreground deletion can leave the Job present until its dependents are gone.
          await this.pool.execute(`UPDATE kubernetes_executions SET cleanup_outcome=NULL,
            failure_reason=IF(receipt_digest IS NOT NULL,NULL,IF(state='CANCEL_REQUESTED','CANCELLED',COALESCE(failure_reason,?))),
            state=IF(receipt_digest IS NOT NULL,'SUCCEEDED',IF(state='CANCEL_REQUESTED','CANCELLED',?)),finished_at=COALESCE(finished_at,UTC_TIMESTAMP(3))
            WHERE id=? AND slot IS NOT NULL`,[failureReason,outcome,row.id]);
          return;
        }
      }
      else if(holdIfMissing)throw new Error('Waiting for the ambiguous create request to settle.');
      await this.pool.execute(`UPDATE kubernetes_executions SET slot=NULL,cleanup_outcome=NULL,
        failure_reason=IF(receipt_digest IS NOT NULL,NULL,IF(state='CANCEL_REQUESTED','CANCELLED',COALESCE(failure_reason,?))),
        state=IF(receipt_digest IS NOT NULL,'SUCCEEDED',IF(state='CANCEL_REQUESTED','CANCELLED',?)),finished_at=COALESCE(finished_at,UTC_TIMESTAMP(3))
        WHERE id=? AND slot IS NOT NULL`,[failureReason,outcome,row.id]);
    }catch{
      await this.pool.execute(`UPDATE kubernetes_executions SET cleanup_outcome=IF(receipt_digest IS NOT NULL,'SUCCEEDED',IF(state='CANCEL_REQUESTED','CANCELLED',?)),
        failure_reason=IF(receipt_digest IS NOT NULL,NULL,IF(state='CANCEL_REQUESTED','CANCELLED',COALESCE(failure_reason,?))),
        state='CLEANUP_PENDING',finished_at=COALESCE(finished_at,UTC_TIMESTAMP(3))
        WHERE id=? AND slot IS NOT NULL`,[outcome,failureReason,row.id]);
    }
  }

  async reconcile(){
    this.reconciliation??=this.reconcileOnce().finally(()=>{this.reconciliation=undefined;});
    return this.reconciliation;
  }

  private async reconcileOnce(){
    const [rows]=await this.pool.execute<(ExecutionRow&{state:string;finished_at:Date|null;cleanup_outcome:string|null})[]>(`SELECT id,job_uid,state,finished_at,cleanup_outcome
      FROM kubernetes_executions WHERE slot IS NOT NULL AND (expires_at<=UTC_TIMESTAMP(3) OR (finished_at IS NOT NULL AND (job_uid IS NOT NULL OR state<>'CLEANUP_PENDING')))`);
    for(const row of rows){
      if(this.pending.has(row.id))continue;
      const outcome=row.state==='CANCEL_REQUESTED'?'CANCELLED':
        row.state==='CLEANUP_PENDING'?(row.cleanup_outcome??'FAILED'):row.finished_at?row.state:'TIMED_OUT';
      // Existing stage failures survive reconciliation through the COALESCE update.
      const failureReason=outcome==='CANCELLED'?'CANCELLED':outcome==='TIMED_OUT'?'DEADLINE_EXCEEDED':null;
      await this.finish(row,outcome,failureReason);
    }
    const connection=await this.pool.getConnection();
    try{
      await connection.beginTransaction();
      const [expired]=await connection.query<RowDataPacket[]>(`SELECT id FROM kubernetes_executions
        WHERE receipt_slot IS NOT NULL AND finished_at IS NOT NULL
          AND (receipt_expires_at IS NULL OR receipt_expires_at<=UTC_TIMESTAMP(3)) FOR UPDATE`);
      for(const {id} of expired){
        await connection.execute('DELETE FROM kubernetes_result_chunks WHERE execution_id=?',[id]);
        await connection.execute('UPDATE kubernetes_executions SET receipt_slot=NULL,receipt_digest=NULL,receipt_bytes=NULL WHERE id=?',[id]);
      }
      await connection.commit();
    }catch(error){
      await connection.rollback();
      throw error;
    }finally{connection.release();}
  }
}
