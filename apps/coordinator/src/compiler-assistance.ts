import {randomUUID} from "node:crypto";
import type {FastifyInstance} from 'fastify';
import type {Store} from './database.js';
import type {NetworkService} from './networks.js';
import {z} from 'zod';
import {workPayloadSchema} from '@omnicompile/contracts';
import {requestDockerJob} from '@omnicompile/orchestration';

export function registerCompilerAssistance(app:FastifyInstance,options:{store:Store;networks:NetworkService;connected:(nodeId:string)=>boolean;cookieName:string;compile?:typeof requestDockerJob}){
 const calls=new Map<string,Promise<unknown>>(),active=new Set<AbortController>();
 const receipts=new Map<string,{nodeId:string;taskId:string;attempt:number;result:unknown;executionTimeMs:number;expiresAt:number;bytes:number;timer:ReturnType<typeof setTimeout>}>();let receiptBytes=0;
 const remove=(key:string)=>{const record=receipts.get(key);if(record){clearTimeout(record.timer);receiptBytes-=record.bytes;receipts.delete(key);}};
 app.addHook('preClose',async()=>{for(const abort of active)abort.abort();for(const key of receipts.keys())remove(key);});
 app.post('/api/worker/compiler',{config:{rateLimit:{max:120,timeWindow:'1 minute'}}},async(request,reply)=>{
  reply.header('Cache-Control','private, no-store');
  const token=request.headers.authorization?.startsWith('Bearer ')?request.headers.authorization.slice(7):request.cookies[options.cookieName];
  const identity=token?await options.networks.authenticateCredential(token):null;
  if(!identity?.nodeId||identity.approvalStatus!=='APPROVED'||!options.connected(identity.nodeId))return reply.code(401).send({error:{code:'WORKER_AUTH_REQUIRED',message:'An active approved device connection is required.'}});
  const parsed=z.object({taskId:z.string().min(1).max(64),attempt:z.number().int().positive()}).strict().safeParse(request.body);
  if(!parsed.success)return reply.code(400).send({error:{code:'INVALID_TOOL_REQUEST',message:'Supply only the assigned task and attempt.'}});
  if(!process.env.OMNICOMPILE_EXECUTOR_URL)return reply.code(503).send({error:{code:'TOOL_SERVICE_UNAVAILABLE',message:'The server compiler tool service is unavailable.'}});
  const {taskId,attempt}=parsed.data,nodeId=identity.nodeId,key=`${nodeId}:${taskId}:${attempt}`;
  const lease=async()=>{
   const current=await options.networks.authenticateCredential(token!);
   if(current?.nodeId!==nodeId||!options.connected(nodeId))return null;
   const [rows]=await options.store.pool.execute<any[]>(`SELECT t.payload_json payload,j.id jobId,TIMESTAMPDIFF(MICROSECOND,UTC_TIMESTAMP(3),a.lease_expires_at)/1000 remainingMs
    FROM tasks t JOIN task_attempts a ON a.task_id=t.id AND a.attempt=t.attempt
    JOIN nodes n ON n.id=t.assigned_node_id JOIN compilation_jobs j ON j.id=t.job_id
    JOIN distributed_networks d ON d.id=t.network_id
    WHERE t.id=? AND t.assigned_node_id=? AND t.network_id=? AND t.attempt=?
    AND t.status IN ('ASSIGNED','RUNNING') AND a.node_id=n.id AND a.status IN ('ASSIGNED','RUNNING')
    AND a.lease_expires_at>UTC_TIMESTAMP(3) AND n.revoked_at IS NULL AND n.current_task_id=t.id
    AND j.status IN ('SUBMITTED','DISTRIBUTING','CODE_GENERATING') AND d.status='ACTIVE'
    AND (d.expires_at IS NULL OR d.expires_at>?)`,[taskId,nodeId,identity.networkId,attempt,new Date().toISOString()]);
   return rows[0]??null;
  };
  const assigned=await lease();
  if(!assigned)return reply.code(409).send({error:{code:'TOOL_LEASE_UNAVAILABLE',message:'This device does not own a current compilation attempt.'}});
  const payload=workPayloadSchema.safeParse(typeof assigned.payload==='string'?JSON.parse(assigned.payload):assigned.payload);
  if(!payload.success||!['c_compile','python_compile','java_compile'].includes(payload.data.operation))return reply.code(422).send({error:{code:'UNSUPPORTED_TOOL_TASK',message:'Only assigned language compilation tasks may use this tool.'}});
  if(calls.has(key)){try{return await calls.get(key);}catch(error){const failure=error as Error&{diagnostics?:unknown};return reply.code(422).send({error:{code:"COMPILER_TOOL_FAILED",message:failure.message,diagnostics:failure.diagnostics}});}}
  const expiresAt=Date.now()+Number(assigned.remainingMs),abort=new AbortController();active.add(abort);
  const deadline=setTimeout(()=>abort.abort(),Math.max(1,Math.min(120000,Number(assigned.remainingMs))));
  const disconnected=()=>{if(!reply.raw.writableEnded)abort.abort();};reply.raw.once('close',disconnected);
  let checking=false;
  const monitor=setInterval(()=>{if(checking)return;checking=true;void lease().then(active=>{if(!active)abort.abort();}).catch(()=>abort.abort()).finally(()=>{checking=false;});},500);
  const operation=(async()=>{
   try{
    await options.store.setTaskRunning(taskId,nodeId,attempt);
    const requestedAssistance={method:'server-assisted compilation',workerNodeId:nodeId,taskId,attempt,provider:'server compiler tool service',status:'REQUESTED'};
    await options.store.pool.execute("UPDATE compilation_jobs SET metrics_json=JSON_SET(COALESCE(metrics_json,JSON_OBJECT()),'$.compilationAssistance',CAST(? AS JSON)) WHERE id=? AND status IN ('SUBMITTED','DISTRIBUTING','CODE_GENERATING')",[JSON.stringify(requestedAssistance),assigned.jobId]);
    const started=performance.now(),language=payload.data.operation.replace('_compile','') as 'c'|'python'|'java';
    const completed=await (options.compile??requestDockerJob)<{result:unknown;executionTimeMs:number}>({kind:'task',language,payload:payload.data},abort.signal);
    if(abort.signal.aborted||!await lease())throw new Error('The assigned tool request was cancelled or expired.');
    const assistance={method:'server-assisted compilation',workerNodeId:nodeId,taskId,attempt,provider:'server compiler tool service',status:'COMPLETED'};
    await options.store.pool.execute("UPDATE compilation_jobs SET metrics_json=JSON_SET(COALESCE(metrics_json,JSON_OBJECT()),'$.compilationAssistance',CAST(? AS JSON)) WHERE id=? AND status IN ('SUBMITTED','DISTRIBUTING','CODE_GENERATING')",[JSON.stringify(assistance),assigned.jobId]);
    if(!completed||!Object.hasOwn(completed,"result"))throw new Error("Compiler tool result is incomplete");
    const executionTimeMs=performance.now()-started,bytes=Buffer.byteLength(JSON.stringify(completed.result));
    for(const [key,record] of receipts)if(record.expiresAt<=Date.now())remove(key);
    if(bytes>32_000_000||receiptBytes+bytes>64_000_000)throw new Error("Compiler tool result transfer capacity is unavailable");
    const receipt=randomUUID(),timer=setTimeout(()=>remove(receipt),Math.max(1,expiresAt-Date.now()));timer.unref();
    receipts.set(receipt,{nodeId,taskId,attempt,result:completed.result,executionTimeMs,expiresAt,bytes,timer});receiptBytes+=bytes;
    // The device acknowledges an identity-bound receipt, not a multi-megabyte binary relay.
    return {result:{operation:'server_compiler_result',receipt},executionTimeMs,assistance};
   }finally{active.delete(abort);clearTimeout(deadline);clearInterval(monitor);reply.raw.off('close',disconnected);calls.delete(key);}
  })();
  calls.set(key,operation);
  try{return await operation;}catch(error){const failure=error as Error&{diagnostics?:unknown};return reply.code(abort.signal.aborted?409:422).send({error:{code:'COMPILER_TOOL_FAILED',message:failure.message,diagnostics:failure.diagnostics}});}
 });
 return {resolveResult(nodeId:string,taskId:string,attempt:number,result:unknown,claimedTimeMs:number){
  const value=result as {operation?:string;receipt?:string}|null;
  if(value?.operation!=='server_compiler_result')return {result,executionTimeMs:claimedTimeMs};
  const key=typeof value.receipt==='string'?value.receipt:'',record=receipts.get(key);
  if(!record||record.nodeId!==nodeId||record.taskId!==taskId||record.attempt!==attempt||record.expiresAt<=Date.now())throw new Error('Compiler tool receipt is stale or belongs to another device attempt');
  return {result:record.result,executionTimeMs:record.executionTimeMs};
 }};
}
