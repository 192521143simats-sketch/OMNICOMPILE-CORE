import {randomUUID} from 'node:crypto';
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

export function inClusterApi():ClusterApi {
  const hostname=process.env.KUBERNETES_SERVICE_HOST;
  if(!hostname)throw new Error('Kubernetes service is unavailable.');
  return async(method,path,body,signal)=>{
    const bounded=AbortSignal.any([AbortSignal.timeout(8000),...(signal?[signal]:[])]);
    const [token,ca]=await Promise.all([readFile(account+'/token','utf8'),readFile(account+'/ca.crt')]);
    return new Promise((resolve,reject)=>{
      const req=request({hostname,port:process.env.KUBERNETES_SERVICE_PORT_HTTPS??443,method,path,ca,signal:bounded,
        headers:{Authorization:'Bearer '+token.trim(),'Content-Type':'application/json'}},response=>{
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
      req.end(body===undefined?undefined:JSON.stringify(body));
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
      finished_at finishedAt FROM kubernetes_executions ORDER BY created_at DESC,id DESC LIMIT 50`);
    return rows;
  }

  async cancel(id:string){
    const [result]=await this.pool.execute<ResultSetHeader>(`UPDATE kubernetes_executions SET state='CANCEL_REQUESTED'
      WHERE id=? AND state IN ('PROVISIONING','RUNNING')`,[id]);
    if(result.affectedRows!==1)return false;
    this.pending.get(id)?.abort();
    return true;
  }

  async run(job:DockerJob,signal:AbortSignal){
    signal.throwIfAborted();
    const input=Buffer.from(JSON.stringify(job));
    if(input.length>maxPayload)throw new Error('Execution input exceeds its limit.');
    const id=randomUUID();
    const count=Math.ceil(input.length/chunkBytes);
    const manifest=executionManifest(id,this.images[job.language],this.runtime,count);
    let admitted=false;
    for(const slot of [1,2]){
      try{
        await this.pool.execute(`INSERT INTO kubernetes_executions(id,slot,language,kind,state,expires_at)
          VALUES(?,?,?,?,'PROVISIONING',TIMESTAMPADD(SECOND,150,UTC_TIMESTAMP(3)))`,[id,slot,job.language,job.kind]);
        admitted=true;break;
      }catch(error){if((error as {code?:string}).code!=='ER_DUP_ENTRY')throw error;}
    }
    if(!admitted)throw Object.assign(new Error('Execution service is at capacity.'),{statusCode:429});
    const abort=new AbortController();
    this.pending.set(id,abort);
    const bounded=AbortSignal.any([signal,abort.signal,AbortSignal.timeout(112_000)]);
    const name=manifest.metadata.name;
    let uid:string|undefined;
    let createAttempted=false;
    let outcome='FAILED';
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
      await this.pool.execute("UPDATE kubernetes_executions SET state='RUNNING' WHERE id=? AND state='PROVISIONING'",[id]);
      for(;;){
        bounded.throwIfAborted();
        const [rows]=await this.pool.execute<RowDataPacket[]>('SELECT state FROM kubernetes_executions WHERE id=?',[id]);
        if(rows[0]?.state==='CANCEL_REQUESTED'){abort.abort();bounded.throwIfAborted();}
        const state=await this.api('GET',this.jobs+'/'+name,undefined,bounded);
        if(state?.metadata?.uid!==uid)throw new Error('Execution Job identity changed.');
        if(state.status?.conditions?.some((condition:any)=>condition.type==='Failed'&&condition.status==='True'))
          throw new Error('Execution Job failed.');
        if(state.status?.succeeded===1)break;
        await delay(750,undefined,{signal:bounded});
      }
      const selector=encodeURIComponent(label+'='+id);
      const pods=await this.api('GET',this.core+'/pods?labelSelector='+selector,undefined,bounded);
      const pod=pods?.items?.find((item:any)=>item.metadata?.ownerReferences?.some((owner:any)=>owner.kind==='Job'&&owner.uid===uid));
      if(!pod?.metadata?.name)throw new Error('Execution Pod is missing.');
      const output=await this.api('GET',this.core+'/pods/'+encodeURIComponent(pod.metadata.name)+'/log?container=runner&limitBytes=32000000',undefined,bounded);
      const value=JSON.parse(output);
      if(value.ok!==true||!Object.hasOwn(value,'result')){
        throw Object.assign(new Error(typeof value.error?.message==='string'?value.error.message:'The isolated compiler job failed.'),{diagnostics:value.error?.diagnostics});
      }
      bounded.throwIfAborted();
      const [completed]=await this.pool.execute<ResultSetHeader>(`UPDATE kubernetes_executions SET
        state='SUCCEEDED',finished_at=UTC_TIMESTAMP(3) WHERE id=? AND state='RUNNING'`,[id]);
      if(completed.affectedRows!==1){abort.abort();throw new Error('Execution was cancelled.');}
      outcome='SUCCEEDED';
      return value.result;
    }catch(error){
      if(abort.signal.aborted||signal.aborted)outcome='CANCELLED';
      else if(bounded.aborted)outcome='TIMED_OUT';
      throw error;
    }finally{
      try{await this.finish({id,job_uid:uid??null},outcome,createAttempted&&!uid);}
      finally{this.pending.delete(id);}
    }
  }

  private async finish(row:ExecutionIdentity,outcome:string,holdIfMissing=false){
    const path=this.jobs+'/omni-'+row.id;
    try{
      const job=await this.api('GET',path);
      if(job){
        const uid=job.metadata?.uid;
        if(!uid||job.metadata?.labels?.[label]!==row.id||(row.job_uid&&uid!==row.job_uid))
          throw new Error('Execution Job ownership could not be verified.');
        if(!job.metadata.deletionTimestamp)await this.api('DELETE',path,{apiVersion:'v1',kind:'DeleteOptions',propagationPolicy:'Foreground',preconditions:{uid}});
        // Keep the slot reserved until reconciliation observes removal.
        await this.pool.execute("UPDATE kubernetes_executions SET cleanup_outcome=NULL,state=IF(state='CANCEL_REQUESTED','CANCELLED',?),finished_at=COALESCE(finished_at,UTC_TIMESTAMP(3)) WHERE id=? AND slot IS NOT NULL",[outcome,row.id]);
        return;
      }
      if(holdIfMissing)throw new Error('Waiting for the ambiguous create request to settle.');
      await this.pool.execute("UPDATE kubernetes_executions SET slot=NULL,cleanup_outcome=NULL,state=IF(state='CANCEL_REQUESTED','CANCELLED',?),finished_at=COALESCE(finished_at,UTC_TIMESTAMP(3)) WHERE id=? AND slot IS NOT NULL",[outcome,row.id]);
    }catch{
      await this.pool.execute("UPDATE kubernetes_executions SET cleanup_outcome=IF(state='CANCEL_REQUESTED','CANCELLED',?),state='CLEANUP_PENDING',finished_at=COALESCE(finished_at,UTC_TIMESTAMP(3)) WHERE id=? AND slot IS NOT NULL",[outcome,row.id]);
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
      if(!this.pending.has(row.id))await this.finish(row,row.state==='CANCEL_REQUESTED'?'CANCELLED':
        row.state==='CLEANUP_PENDING'?(row.cleanup_outcome??'FAILED'):row.finished_at?row.state:'TIMED_OUT');
    }
  }
}
