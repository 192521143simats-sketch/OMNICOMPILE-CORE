import {kubernetesCleanupOutcomeMigration} from './migrations/0017-kubernetes-cleanup-outcome.mjs';
import {kubernetesExecutionsMigration} from './migrations/0016-kubernetes-executions.mjs';
import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {networkPolicySchema} from "@omnicompile/contracts";
import {evaluateNode,type TaskRequirements,type ExecutionMode} from "@omnicompile/orchestration";
import type { CapabilityProfile, NodeStatus, ResourceSnapshot, TaskStatus, WorkPayload } from "@omnicompile/contracts";
import type {CIntermediateRepresentation,IRFunction} from "@omnicompile/compiler-c";
import {verifyIROptimization} from "./compilation-verification.js";
import {verifyPortableResult,StaleTaskResultError} from "./portable-verification.js";
import {retryTransaction} from "./transaction.js";
import {applyMigrations} from "./migrations.js";
import {CompilerMetrics} from './compiler-metrics.js';
import {configuredArtifactStorage,type S3ArtifactStorage} from './artifact-storage.js';
import {artifactObjectStorageMigration} from './migrations/0013-artifact-object-storage.mjs';
import {nativeDownloadGrantsMigration} from './migrations/0014-native-download-grants.mjs';
import {invitationRedemptionsMigration} from './migrations/0015-invitation-redemptions.mjs';
import {executionLocationMigration} from './migrations/0012-execution-location.mjs';
import {compilerMetricsMigration} from './migrations/0011-compiler-metrics.mjs';
import {nativeArtifacts} from './compiler-artifacts.js';
import {workerApprovalMigration} from './migrations/0010-worker-approval.mjs';
import {existingSchemaMigration} from "./migrations/0001-existing-schema.mjs";
import {workerInvitationMigration} from "./migrations/0002-worker-invitations.mjs";
import {reusableNetworkLinkMigration} from "./migrations/0003-reusable-network-links.mjs";
import {taskAttemptLeaseMigration} from "./migrations/0004-task-attempt-leases.mjs";
import {attemptFailureReasonMigration} from './migrations/0007-attempt-failure-reasons.mjs';
import {computeOwnershipMigration} from './migrations/0008-compute-ownership.mjs';
import {userPreferencesMigration} from './migrations/0009-user-preferences.mjs';
import {taskPolicyIntegrityMigration} from './migrations/0006-task-policy-integrity.mjs';
import {verifyArtifactIntegrity} from './task-policy.js';
import {recoverTaskAttempts} from "./task-recovery.js";
import {taskCancellationMigration} from "./migrations/0005-task-cancellation.mjs";
import {cancelCompilationJob,cancelPortableTask,lockActiveJob,terminalJobStatuses,InactiveJobError} from "./task-cancellation.js";

export type DatabaseConfig={host:string;port:number;name:string;user:string;password:string};
export type StoredArtifact={artifactType:"SOURCE"|"GENERATED_SOURCE"|"EXECUTABLE"|"BYTECODE"|"JAR"|"BUILD_REPORT_JSON"|"BUILD_REPORT_PDF";fileName:string;mediaType:string;bytes:Buffer};

type PreparedArtifact=StoredArtifact & {id:string;digest:string;storageKey:string|null};

export function databaseMigrationPlan(){return [existingSchemaMigration(),workerInvitationMigration(),reusableNetworkLinkMigration(),taskAttemptLeaseMigration(),taskCancellationMigration(),taskPolicyIntegrityMigration(),attemptFailureReasonMigration(),computeOwnershipMigration(),userPreferencesMigration(),workerApprovalMigration(),compilerMetricsMigration(),executionLocationMigration(),artifactObjectStorageMigration(),nativeDownloadGrantsMigration(),invitationRedemptionsMigration(),kubernetesExecutionsMigration(),kubernetesCleanupOutcomeMigration()];}

export class Store {
  private readonly verifyingTasks=new Set<string>();
  readonly metrics:CompilerMetrics;
  private artifactMaintenance:ReturnType<typeof setInterval>|undefined;
  private artifactMaintenanceRunning=false;
  private constructor(readonly pool:Pool,private readonly artifactStorage:S3ArtifactStorage|undefined){this.metrics=new CompilerMetrics(pool,Number(process.env.HEARTBEAT_OFFLINE_MS??30_000));}
  static async connect(config:DatabaseConfig){const pool=mysql.createPool({host:config.host,port:config.port,database:config.name,user:config.user,password:config.password,waitForConnections:true,connectionLimit:10,queueLimit:0,timezone:"Z",decimalNumbers:true});const store=new Store(pool,configuredArtifactStorage(config.name));try{const mode=process.env.OMNICOMPILE_MIGRATION_MODE??'apply';if(mode!=='apply'&&mode!=='check')throw new Error('Invalid migration mode');await applyMigrations(pool,config.name,databaseMigrationPlan(),mode);await store.artifactStorage?.initialize();return store;}catch(error){await pool.end();throw error;}}
  async close(){if(this.artifactMaintenance)clearInterval(this.artifactMaintenance);this.artifactStorage?.close();await this.pool.end();}
  async reconcileArtifactStorage(options:{apply?:boolean}={}){
    if(!this.artifactStorage)throw new Error('Artifact object storage is not configured');
    return this.artifactStorage.reconcile({
      apply:options.apply===true,
      graceHours:Number(process.env.OMNICOMPILE_ARTIFACT_ORPHAN_GRACE_HOURS??24),
      limit:Number(process.env.OMNICOMPILE_ARTIFACT_RECONCILE_LIMIT??100),
      probeDatabase:async()=>{await this.pool.query('SELECT 1');},
      isReferenced:async key=>{const [rows]=await this.pool.execute<RowDataPacket[]>('SELECT id FROM artifacts WHERE storage_key=? LIMIT 1',[key]);return rows.length>0;}
    });
  }
  startArtifactMaintenance(){
    const interval=Number(process.env.OMNICOMPILE_ARTIFACT_RECONCILE_INTERVAL_MS??0);
    if(!this.artifactStorage||interval===0)return;
    const grace=Number(process.env.OMNICOMPILE_ARTIFACT_ORPHAN_GRACE_HOURS??24);
    const limit=Number(process.env.OMNICOMPILE_ARTIFACT_RECONCILE_LIMIT??100);
    if(!Number.isInteger(interval)||interval<3_600_000||interval>86_400_000||!Number.isInteger(grace)||grace<24||grace>8760||!Number.isInteger(limit)||limit<1||limit>1000)throw new Error('Invalid artifact maintenance policy');
    if(this.artifactMaintenance)return;
    // Wait a full interval after startup. A restart never triggers a destructive sweep.
    this.artifactMaintenance=setInterval(()=>{
      if(this.artifactMaintenanceRunning)return;
      this.artifactMaintenanceRunning=true;
      void this.reconcileArtifactStorage({apply:true}).then(result=>console.log(JSON.stringify({event:'artifact_orphan_reconciliation',...result}))).catch(()=>console.error('Artifact reconciliation stopped; database or storage authority was unavailable.')).finally(()=>{this.artifactMaintenanceRunning=false;});
    },interval);
    this.artifactMaintenance.unref();
  }
  async recoverTaskAttempts(restart=false,serverInterrupted=false){return recoverTaskAttempts(this.pool,restart,serverInterrupted);}
  async cancelCompilationJob(jobId:string,actorId:string,admin=false){return cancelCompilationJob(this.pool,jobId,actorId,admin);}
  async cancelPortableTask(taskId:string,actorId:string,actorType:'ADMIN'|'USER'='ADMIN'){return cancelPortableTask(this.pool,taskId,actorId,actorType);}
  now(){return new Date().toISOString();} hash(token:string){return createHash("sha256").update(token).digest("hex");} token(){return randomBytes(32).toString("base64url");} id(prefix:string){return `${prefix}-${randomUUID()}`;}
  private transaction<T>(work:(connection:PoolConnection)=>Promise<T>){return retryTransaction(this.pool,work);}

  async heartbeat(nodeId:string,resources:ResourceSnapshot){const [changed]=await this.pool.execute<ResultSetHeader>("UPDATE nodes SET status=CASE WHEN status IN ('ONLINE','UNAVAILABLE') THEN 'AVAILABLE' ELSE status END,resource_json=?,last_heartbeat=?,disconnected_at=NULL WHERE id=? AND status!='OFFLINE' AND revoked_at IS NULL",[JSON.stringify(resources),this.now(),nodeId]);return changed.affectedRows===1;}
  async markDisconnected(nodeId:string){await this.pool.execute("UPDATE nodes SET status='OFFLINE',disconnected_at=? WHERE id=? AND status!='OFFLINE'",[this.now(),nodeId]);}
  async recoverStaleNodes(staleBefore:string,offlineBefore:string,serverInterrupted=false){return this.transaction(async connection=>{const[rows]=await connection.execute<RowDataPacket[]>("SELECT id,status,last_heartbeat lastHeartbeat,current_task_id currentTaskId FROM nodes WHERE last_heartbeat<? AND status!='OFFLINE' AND revoked_at IS NULL FOR UPDATE",[staleBefore]);const recovered: Array<{nodeId:string;taskId:string|null;status:"UNAVAILABLE"|"OFFLINE"}> = [];for(const row of rows){const nodeId=String(row.id),taskId=row.currentTaskId?String(row.currentTaskId):null,status=Date.parse(String(row.lastHeartbeat))<Date.parse(offlineBefore)?"OFFLINE":"UNAVAILABLE",timestamp=this.now(),reason=`Worker heartbeat lost; node marked ${status}`;if(taskId){const[taskRows]=await connection.execute<RowDataPacket[]>("SELECT attempt FROM tasks WHERE id=? FOR UPDATE",[taskId]);const attempt=Number(taskRows[0]?.attempt??0);await connection.execute("UPDATE task_attempts SET status='INTERRUPTED',completed_at=?,error=?,failure_reason=? WHERE task_id=? AND attempt=? AND status IN ('ASSIGNED','RUNNING')",[timestamp,reason,serverInterrupted?'SERVER_FAILURE':'NETWORK_FAILURE',taskId,attempt]);await connection.execute("UPDATE tasks SET status=IF(attempt>=max_attempts,'FAILED','REQUEUED'),error=?,assigned_node_id=NULL,next_eligible_at=TIMESTAMPADD(MICROSECOND,LEAST(30000000,500000*POW(2,LEAST(6,GREATEST(0,attempt-1)))*(1+CONV(SUBSTRING(SHA2(CONCAT(id,':',attempt),256),1,4),16,10)/65535*.25)),UTC_TIMESTAMP(3)),completed_at=IF(attempt>=max_attempts,?,completed_at) WHERE id=? AND status IN ('ASSIGNED','RUNNING')",[reason,timestamp,taskId]);}await connection.execute("UPDATE nodes SET status=?,current_task_id=NULL,disconnected_at=CASE WHEN ?='OFFLINE' THEN ? ELSE disconnected_at END WHERE id=?",[status,status,timestamp,nodeId]);recovered.push({nodeId,taskId,status});}return recovered;});}
  async createJobWorkTask(jobId:string,networkId:string,kind:"C_COMPILE"|"PYTHON_COMPILE"|"JAVA_COMPILE",payload:WorkPayload,capability:"c"|"python"|"java"){return this.transaction(async connection=>{await lockActiveJob(connection,jobId,networkId);const id=this.id("TASK"),createdAt=this.now();await connection.execute("INSERT INTO tasks(id,session_id,network_id,kind,payload_json,required_capability,status,created_at,job_id,deadline_at) VALUES(?,NULL,?,?,?,?, 'QUEUED',?,?,TIMESTAMPADD(SECOND,300,UTC_TIMESTAMP(3)))",[id,networkId,kind,JSON.stringify(payload),capability,createdAt,jobId]);return{id,networkId,kind,payload,status:"QUEUED" as TaskStatus,attempt:0};});}
  async getCompilationJobForTask(taskId:string){const[rows]=await this.pool.execute<RowDataPacket[]>("SELECT job_id jobId FROM tasks WHERE id=?",[taskId]);return rows[0]?.jobId?this.getCompilationJob(String(rows[0].jobId)):undefined;}
  async createCOptimizationBatch(networkId:string,ir:CIntermediateRepresentation,jobId?:string){return this.transaction(async connection=>{if(jobId)await lockActiveJob(connection,jobId,networkId);const batchId=this.id("BATCH"),createdAt=this.now(),tasks: Array<{taskId:string;functionName:string;status:"QUEUED"}> = [];await connection.execute("INSERT INTO optimization_batches(id,session_id,network_id,language,status,original_ir_json,created_at) VALUES(?,NULL,?,'c','DISTRIBUTING',?,?)",[batchId,networkId,JSON.stringify(ir),createdAt]);for(const fn of ir.functions){const taskId=this.id("TASK"),payload={operation:"c_optimize_ir" as const,function:fn};await connection.execute("INSERT INTO tasks(id,session_id,network_id,kind,payload_json,required_capability,status,created_at,deadline_at) VALUES(?,NULL,?,'C_OPTIMIZE_IR',?,'ir','QUEUED',?,TIMESTAMPADD(SECOND,300,UTC_TIMESTAMP(3)))",[taskId,networkId,JSON.stringify(payload),createdAt]);await connection.execute("INSERT INTO optimization_batch_tasks(batch_id,task_id,function_name) VALUES(?,?,?)",[batchId,taskId,fn.name]);tasks.push({taskId,functionName:fn.name,status:"QUEUED"});}if(jobId)await connection.execute("UPDATE compilation_jobs SET status='DISTRIBUTING',stage='DISTRIBUTED_OPTIMIZATION',batch_id=? WHERE id=?",[batchId,jobId]);return{batchId,irKind:ir.kind,irVersion:ir.version,tasks};});}
  async getCOptimizationBatchForTask(taskId:string){const[rows]=await this.pool.execute<RowDataPacket[]>("SELECT batch_id batchId FROM optimization_batch_tasks WHERE task_id=?",[taskId]);return rows[0]?this.getCOptimizationBatch(String(rows[0].batchId)):undefined;}
  async getCOptimizationBatch(batchId:string){const[[batchRows],[taskRows]]=await Promise.all([this.pool.execute<RowDataPacket[]>("SELECT id,session_id sessionId,status,original_ir_json originalIrJson,selected_ir_json selectedIrJson,evaluation_json evaluationJson,created_at createdAt,completed_at completedAt FROM optimization_batches WHERE id=?",[batchId]),this.pool.execute<RowDataPacket[]>(`SELECT bt.task_id taskId,bt.function_name functionName,t.status,t.assigned_node_id nodeId,t.attempt,r.result_json resultJson,r.execution_time_ms executionTimeMs FROM optimization_batch_tasks bt JOIN tasks t ON t.id=bt.task_id LEFT JOIN results r ON r.task_id=t.id AND r.attempt=t.attempt WHERE bt.batch_id=? ORDER BY bt.function_name`,[batchId])]);const row=batchRows[0];if(!row)return undefined;return{id:String(row.id),sessionId:String(row.sessionId),status:String(row.status),originalIR:this.parseJson<CIntermediateRepresentation>(row.originalIrJson),selectedIR:row.selectedIrJson?this.parseJson<CIntermediateRepresentation>(row.selectedIrJson):null,evaluation:row.evaluationJson?this.parseJson(row.evaluationJson):null,createdAt:String(row.createdAt),completedAt:row.completedAt?String(row.completedAt):null,tasks:taskRows.map(task=>({taskId:String(task.taskId),functionName:String(task.functionName),status:String(task.status),nodeId:task.nodeId?String(task.nodeId):null,attempt:Number(task.attempt),executionTimeMs:task.executionTimeMs===null?null:Number(task.executionTimeMs),result:task.resultJson?this.parseJson<any>(task.resultJson):null}))};}
  async completeCOptimizationBatch(batchId:string,selectedIR:CIntermediateRepresentation,evaluation:unknown){const[result]=await this.pool.execute<ResultSetHeader>("UPDATE optimization_batches SET status='COMPLETED',selected_ir_json=?,evaluation_json=?,completed_at=? WHERE id=? AND status='DISTRIBUTING'",[JSON.stringify(selectedIR),JSON.stringify(evaluation),this.now(),batchId]);return result.affectedRows===1;}
  async createCompilationJob(userId:string,networkId:string,language:"c"|"python"|"java",sourceName:string,source:string,executionInput="",executionMode:ExecutionMode="HYBRID"){const createdAt=this.now();for(let attempt=0;attempt<20;attempt++){const id=`JOB-${Array.from(randomBytes(5),value=>"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[value%36]).join("")}`;try{await this.pool.execute("INSERT INTO compilation_jobs(id,user_id,network_id,language,source_name,source_text,status,stage,created_at,metrics_json,execution_mode) VALUES(?,?,?,?,?,?,'SUBMITTED','VALIDATING',?,?,?)",[id,userId,networkId,language,sourceName,source,createdAt,JSON.stringify({executionInput}),executionMode]);return{id,userId,networkId,language,sourceName,executionMode,status:"SUBMITTED",stage:"VALIDATING",createdAt};}catch(error){if((error as {code?:string}).code!=="ER_DUP_ENTRY")throw error;}}throw new Error("Could not allocate a unique job ID");}
  async attachJobBatch(jobId:string,batchId:string){await this.transaction(async connection=>{await lockActiveJob(connection,jobId);await connection.execute("UPDATE compilation_jobs SET status='DISTRIBUTING',stage='DISTRIBUTED_OPTIMIZATION',batch_id=? WHERE id=?",[batchId,jobId]);});}
  async setJobStage(jobId:string,status:string,stage:string){const [changed]=await this.pool.execute<ResultSetHeader>("UPDATE compilation_jobs SET status=?,stage=? WHERE id=? AND status NOT IN ('COMPLETED','FAILED','CANCELLED')",[status,stage,jobId]);if(!changed.affectedRows)throw new InactiveJobError();}
  private async persistArtifacts(jobId:string,artifacts:StoredArtifact[],write:(prepared:PreparedArtifact[])=>Promise<boolean>){
    if(!artifacts.length||artifacts.some(artifact=>!artifact.bytes.length))throw new Error("Required output artifact is missing");
    const prepared=artifacts.map(artifact=>{const id=this.id('ARTIFACT');return {...artifact,id,digest:createHash('sha256').update(artifact.bytes).digest('hex'),storageKey:this.artifactStorage?this.artifactStorage.objectKey(jobId,id):null};});
    const uploaded:string[]=[];
    try{
      if(this.artifactStorage)for(const artifact of prepared){await this.artifactStorage.put(artifact.storageKey!,artifact.bytes,artifact.mediaType);uploaded.push(artifact.storageKey!);}
    }catch(error){
      await this.removeArtifactObjects(uploaded);
      throw error;
    }
    try{
      const retained=await write(prepared);
      if(!retained)await this.removeArtifactObjects(uploaded);
    }catch(error){
      // A lost commit acknowledgement must never delete an object retained by MySQL.
      // If MySQL is unavailable, retain private objects for later reconciliation.
      if(this.artifactStorage){
        try{
          const [rows]=await this.pool.execute<RowDataPacket[]>("SELECT storage_key storageKey FROM artifacts WHERE job_id=? AND storage_key IS NOT NULL",[jobId]);
          const retained=new Set(rows.map(row=>String(row.storageKey)));
          await this.removeArtifactObjects(uploaded.filter(key=>!retained.has(key)));
        }catch{console.error('Artifact cleanup requires database/storage reconciliation.');}
      }
      throw error;
    }
  }
  private async removeArtifactObjects(keys:string[]){
    if(!this.artifactStorage)return;
    for(const key of keys)try{await this.artifactStorage.remove(key);}catch{console.error('An uncommitted artifact object requires storage reconciliation.');}
  }
  private async insertArtifact(connection:PoolConnection,jobId:string,language:unknown,artifact:PreparedArtifact){
    const extension=artifact.fileName.includes('.')?artifact.fileName.slice(artifact.fileName.lastIndexOf('.')):'';
    await connection.execute("INSERT INTO artifacts(id,job_id,language,artifact_type,file_extension,file_name,media_type,content,size_bytes,created_at,content_sha256,storage_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",[artifact.id,jobId,String(language),artifact.artifactType,extension,artifact.fileName,artifact.mediaType,artifact.storageKey?Buffer.alloc(0):artifact.bytes,artifact.bytes.length,this.now(),artifact.digest,artifact.storageKey]);
  }
  async completeCompilationJob(jobId:string,artifacts:StoredArtifact[],metrics:unknown){
    await this.persistArtifacts(jobId,artifacts,prepared=>this.transaction(async connection=>{
      const [jobs]=await connection.execute<RowDataPacket[]>("SELECT language,status FROM compilation_jobs WHERE id=? FOR UPDATE",[jobId]);
      const job=jobs[0];if(!job||terminalJobStatuses.includes(job.status))throw new InactiveJobError();
      for(const artifact of prepared)await this.insertArtifact(connection,jobId,job.language,artifact);
      await connection.execute("UPDATE compilation_jobs SET status='COMPLETED',stage='COMPLETED',metrics_json=?,completed_at=?,error=NULL WHERE id=?",[JSON.stringify(metrics),this.now(),jobId]);
      return true;
    }));
  }
  async failCompilationJob(jobId:string,error:string){await this.pool.execute("UPDATE compilation_jobs SET status='FAILED',error=?,completed_at=? WHERE id=? AND status NOT IN ('COMPLETED','CANCELLED')",[error,this.now(),jobId]);}
  async attachFailureReports(jobId:string,reports:StoredArtifact[],error?:string){
    if(reports.some(report=>!["BUILD_REPORT_JSON","BUILD_REPORT_PDF"].includes(report.artifactType)||!report.bytes.length))throw new Error("Invalid failure report");
    // Report storage failure must not leave an already failed job distributing forever.
    if(error!==undefined)await this.failCompilationJob(jobId,error);
    await this.persistArtifacts(jobId,reports,prepared=>this.transaction(async connection=>{
      const [rows]=await connection.execute<RowDataPacket[]>("SELECT language,status FROM compilation_jobs WHERE id=? FOR UPDATE",[jobId]);
      if(rows[0]?.status!=="FAILED")return false;
      const [existing]=await connection.execute<RowDataPacket[]>("SELECT id FROM artifacts WHERE job_id=? LIMIT 1",[jobId]);
      if(existing.length)return false;
      for(const report of prepared)await this.insertArtifact(connection,jobId,rows[0].language,report);
      return true;
    }));
  }
  async getCompilationJob(jobId:string){const[rows]=await this.pool.execute<RowDataPacket[]>(`SELECT id,user_id userId,network_id networkId,language,execution_mode executionMode,source_name sourceName,status,stage,batch_id batchId,error,metrics_json metricsJson,created_at createdAt,completed_at completedAt FROM compilation_jobs WHERE id=?`,[jobId]);const row=rows[0];if(!row)return undefined;const[artifacts]=await this.pool.execute<RowDataPacket[]>("SELECT id,job_id jobId,language,artifact_type artifactType,file_extension fileExtension,file_name fileName,media_type mediaType,size_bytes sizeBytes,created_at createdAt FROM artifacts WHERE job_id=? ORDER BY created_at,id",[jobId]);const[placements]=await this.pool.execute<RowDataPacket[]>("SELECT DISTINCT e.execution_location executionLocation FROM task_attempts a JOIN tasks t ON t.id=a.task_id JOIN nodes n ON n.id=a.node_id JOIN network_enrollments e ON e.id=n.enrollment_id WHERE t.job_id=? OR t.id IN (SELECT bt.task_id FROM optimization_batch_tasks bt WHERE bt.batch_id=?) ORDER BY e.execution_location",[jobId,row.batchId??null]);return{executionLocations:placements.map(item=>String(item.executionLocation)),id:String(row.id),userId:row.userId?String(row.userId):null,networkId:row.networkId?String(row.networkId):null,language:String(row.language),executionMode:String(row.executionMode),sourceName:String(row.sourceName),status:String(row.status),stage:String(row.stage),batchId:row.batchId?String(row.batchId):null,error:row.error?String(row.error):null,metrics:row.metricsJson?this.parseJson(row.metricsJson):null,createdAt:String(row.createdAt),completedAt:row.completedAt?String(row.completedAt):null,artifacts:artifacts.map(artifact=>({...artifact,sizeBytes:Number(artifact.sizeBytes),downloadUrl:`/api/artifacts/${artifact.id}/download`}))};}
  async getCompilationSource(jobId:string){const[rows]=await this.pool.execute<RowDataPacket[]>("SELECT source_name sourceName,source_text sourceText,language,created_at createdAt FROM compilation_jobs WHERE id=?",[jobId]);return rows[0]?{sourceName:String(rows[0].sourceName),sourceText:String(rows[0].sourceText),language:String(rows[0].language) as "c"|"python"|"java",createdAt:String(rows[0].createdAt)}:undefined;}
  async getCompilationJobByBatch(batchId:string){const[rows]=await this.pool.execute<RowDataPacket[]>("SELECT id FROM compilation_jobs WHERE batch_id=?",[batchId]);return rows[0]?this.getCompilationJob(String(rows[0].id)):undefined;}
  async getArtifactMetadata(artifactId:string){
    const [rows]=await this.pool.execute<RowDataPacket[]>("SELECT a.id,a.job_id jobId,a.file_name fileName,j.user_id userId,j.status FROM artifacts a JOIN compilation_jobs j ON j.id=a.job_id WHERE a.id=?",[artifactId]);
    return rows[0]?{id:String(rows[0].id),jobId:String(rows[0].jobId),fileName:String(rows[0].fileName),userId:rows[0].userId?String(rows[0].userId):null,status:String(rows[0].status)}:undefined;
  }
  async getArtifact(artifactId:string){
    const [rows]=await this.pool.execute<RowDataPacket[]>("SELECT id,job_id jobId,file_name fileName,media_type mediaType,content,size_bytes sizeBytes,content_sha256 digest,storage_key storageKey FROM artifacts WHERE id=?",[artifactId]);
    const row=rows[0];if(!row)return undefined;
    let content=row.content as Buffer;
    if(row.storageKey){
      if(!this.artifactStorage)throw new Error('Artifact object storage is not configured');
      try{content=await this.artifactStorage.get(String(row.storageKey),Number(row.sizeBytes),row.digest);}
      catch{return undefined;}
    }
    return verifyArtifactIntegrity(content,Number(row.sizeBytes),row.digest)?{id:String(row.id),jobId:String(row.jobId),fileName:String(row.fileName),mediaType:String(row.mediaType),content,sizeBytes:Number(row.sizeBytes)}:undefined;
  }
  async networkPolicy(networkId:string){const [rows]=await this.pool.execute<RowDataPacket[]>("SELECT configuration_json configuration FROM distributed_networks WHERE id=? AND status='ACTIVE'",[networkId]);return networkPolicySchema.parse(rows[0]?this.parseJson<any>(rows[0].configuration)?.policy??{}:{});}
  async expireQueuedTasks(){await this.pool.execute("UPDATE tasks SET status='FAILED',error='Task admission deadline expired before an eligible worker was available',completed_at=? WHERE status IN ('QUEUED','REQUEUED') AND deadline_at<=UTC_TIMESTAMP(3)",[this.now()]);}
  async pendingTasks(){const[rows]=await this.pool.execute<RowDataPacket[]>("SELECT id,network_id networkId,kind,payload_json payloadJson,required_capability requiredCapability,status,attempt,timeout_ms timeoutMs,COALESCE((SELECT j.execution_mode FROM compilation_jobs j WHERE j.id=tasks.job_id),(SELECT j.execution_mode FROM compilation_jobs j JOIN optimization_batch_tasks bt ON bt.batch_id=j.batch_id WHERE bt.task_id=tasks.id LIMIT 1)) executionMode FROM tasks WHERE network_id IS NOT NULL AND status IN ('QUEUED','REQUEUED') AND (next_eligible_at IS NULL OR next_eligible_at<=UTC_TIMESTAMP(3)) AND (deadline_at IS NULL OR deadline_at>UTC_TIMESTAMP(3)) ORDER BY priority DESC,created_at");return rows.map(row=>({id:String(row.id),networkId:String(row.networkId),kind:String(row.kind) as "TEST_COMPUTE"|"C_OPTIMIZE_IR"|"C_COMPILE"|"PYTHON_COMPILE"|"JAVA_COMPILE",payload:this.parseJson<WorkPayload>(row.payloadJson),requiredCapability:String(row.requiredCapability) as "base"|"ir"|"c"|"python"|"java",status:row.status as TaskStatus,attempt:Number(row.attempt),timeoutMs:Number(row.timeoutMs),...(row.executionMode?{executionMode:String(row.executionMode) as ExecutionMode}:{})}));}
  async getTask(taskId:string){const[rows]=await this.pool.execute<RowDataPacket[]>("SELECT id,session_id sessionId,network_id networkId,kind,payload_json payloadJson,status,assigned_node_id assignedNodeId,attempt FROM tasks WHERE id=?",[taskId]);const row=rows[0];return row?{...row,id:String(row.id),networkId:row.networkId?String(row.networkId):null,status:String(row.status),assignedNodeId:row.assignedNodeId?String(row.assignedNodeId):null,attempt:Number(row.attempt),kind:String(row.kind),payload:this.parseJson(row.payloadJson),payloadJson:undefined}:undefined;}
  async availableNodes(networkId:string,includeBusy=false){const[[rows],[historyRows]]=await Promise.all([this.pool.execute<RowDataPacket[]>("SELECT n.id,n.network_id networkId,n.status,n.profile_json profileJson,n.resource_json resourceJson,n.last_heartbeat lastHeartbeat,e.execution_location executionLocation FROM nodes n JOIN network_enrollments e ON e.id=n.enrollment_id WHERE n.network_id=? AND n.revoked_at IS NULL AND (n.status='AVAILABLE' AND n.current_task_id IS NULL OR ? AND n.status='BUSY')",[networkId,includeBusy]),this.pool.execute<RowDataPacket[]>(`SELECT a.node_id nodeId,t.required_capability capability,COUNT(*) sampleCount,AVG(r.execution_time_ms) averageExecutionTimeMs,AVG(a.status='COMPLETED') successRate FROM task_attempts a JOIN tasks t ON t.id=a.task_id LEFT JOIN results r ON r.task_id=a.task_id AND r.attempt=a.attempt WHERE t.network_id=? AND a.status IN ('COMPLETED','FAILED','TIMED_OUT','INTERRUPTED') AND (a.failure_reason IS NULL OR a.failure_reason NOT IN ('USER_PAUSED','USER_LEFT','SERVER_FAILURE')) GROUP BY a.node_id,t.required_capability`,[networkId])]);const history=new Map<string,Record<string,unknown>>();for(const item of historyRows){const record=history.get(String(item.nodeId))??{};record[String(item.capability)]={sampleCount:Number(item.sampleCount),averageExecutionTimeMs:item.averageExecutionTimeMs===null?NaN:Number(item.averageExecutionTimeMs),successRate:Number(item.successRate)};history.set(String(item.nodeId),record);}return rows.map(row=>({id:String(row.id),networkId:String(row.networkId),executionLocation:row.executionLocation as "LOCAL"|"CLOUD",status:String(row.status),profile:this.parseJson<CapabilityProfile>(row.profileJson),resources:row.resourceJson?this.parseJson<ResourceSnapshot>(row.resourceJson):null,lastHeartbeat:String(row.lastHeartbeat),...(this.parseJson<CapabilityProfile>(row.profileJson).contributionPolicy?{contributionPolicy:this.parseJson<CapabilityProfile>(row.profileJson).contributionPolicy!}:{}),reliability:(()=>{const samples=Object.values(history.get(String(row.id))??{}) as Array<{sampleCount:number;successRate:number}>;const sampleCount=samples.reduce((sum,item)=>sum+item.sampleCount,0);return {sampleCount,successRate:sampleCount?samples.reduce((sum,item)=>sum+item.sampleCount*item.successRate,0)/sampleCount:null};})(),historicalPerformance:history.get(String(row.id))??{}}));}
  async connectedNodes(networkId:string){const[rows]=await this.pool.execute<RowDataPacket[]>("SELECT id,status,profile_json profileJson FROM nodes WHERE network_id=? AND revoked_at IS NULL AND status IN ('ONLINE','AVAILABLE','BUSY')",[networkId]);return rows.map(row=>({id:String(row.id),status:String(row.status),profile:this.parseJson<CapabilityProfile>(row.profileJson)}));}
  async assignTask(taskId:string,nodeId:string,score:number,explanation:string,timeoutMs=30_000,requirements?:TaskRequirements){if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>2_147_483_647)throw new Error("Invalid task lease duration");return this.transaction(async connection=>{const[rows]=await connection.execute<RowDataPacket[]>("SELECT status,attempt,max_attempts maxAttempts,network_id networkId,required_capability requiredCapability,COALESCE((SELECT j.execution_mode FROM compilation_jobs j WHERE j.id=tasks.job_id),(SELECT j.execution_mode FROM compilation_jobs j JOIN optimization_batch_tasks bt ON bt.batch_id=j.batch_id WHERE bt.task_id=tasks.id LIMIT 1)) executionMode,(next_eligible_at IS NULL OR next_eligible_at<=UTC_TIMESTAMP(3)) eligible,(deadline_at IS NULL OR deadline_at>UTC_TIMESTAMP(3)) withinDeadline FROM tasks WHERE id=? FOR UPDATE",[taskId]);const task=rows[0] as {status:TaskStatus;attempt:number;maxAttempts:number;networkId:string;requiredCapability:TaskRequirements["capability"];executionMode:ExecutionMode|null;eligible:number;withinDeadline:number}|undefined;if(!task||!["QUEUED","REQUEUED"].includes(task.status)||Number(task.attempt)>=Number(task.maxAttempts)||!task.eligible||!task.withinDeadline)throw new Error("Task is not assignable");const [networkRows]=await connection.execute<RowDataPacket[]>("SELECT configuration_json configuration,status,expires_at expiresAt FROM distributed_networks WHERE id=? FOR UPDATE",[task.networkId]);const network=networkRows[0];if(!network||network.status!=="ACTIVE"||network.expiresAt&&Date.parse(String(network.expiresAt))<=Date.now())throw new Error("Network is unavailable");
    if(requirements||task.executionMode){const candidateRequirements=requirements??{capability:task.requiredCapability};const [reliabilityRows]=await connection.execute<RowDataPacket[]>("SELECT COUNT(*) sampleCount,AVG(status='COMPLETED') successRate FROM task_attempts WHERE node_id=? AND status IN ('COMPLETED','FAILED','TIMED_OUT','INTERRUPTED') AND (failure_reason IS NULL OR failure_reason NOT IN ('USER_PAUSED','USER_LEFT','SERVER_FAILURE'))",[nodeId]);const [nodeRows]=await connection.execute<RowDataPacket[]>("SELECT n.id,n.network_id networkId,n.status,n.profile_json profileJson,n.resource_json resourceJson,n.last_heartbeat lastHeartbeat,e.execution_location executionLocation FROM nodes n JOIN network_enrollments e ON e.id=n.enrollment_id WHERE n.id=? FOR UPDATE",[nodeId]);const row=nodeRows[0];if(!row)throw new Error("Node is unavailable");const node={id:String(row.id),networkId:String(row.networkId),executionLocation:row.executionLocation as "LOCAL"|"CLOUD",status:String(row.status),profile:this.parseJson<CapabilityProfile>(row.profileJson),resources:row.resourceJson?this.parseJson<ResourceSnapshot>(row.resourceJson):null,lastHeartbeat:String(row.lastHeartbeat),...(this.parseJson<CapabilityProfile>(row.profileJson).contributionPolicy?{contributionPolicy:this.parseJson<CapabilityProfile>(row.profileJson).contributionPolicy!}:{}),reliability:{sampleCount:Number(reliabilityRows[0]?.sampleCount??0),successRate:reliabilityRows[0]?.successRate==null?null:Number(reliabilityRows[0].successRate)}};const policy=networkPolicySchema.parse(this.parseJson<any>(network.configuration)?.policy??{});if(!evaluateNode(node,{...candidateRequirements,networkId:task.networkId,...(task.executionMode?{executionMode:task.executionMode}:{})},{nowMs:Date.now(),policy}).eligible)throw new Error("Node no longer satisfies task/network policy");}
    const attempt=Number(task.attempt)+1,assignedAt=this.now();const[nodeChanged]=await connection.execute<ResultSetHeader>("UPDATE nodes SET status='BUSY',current_task_id=? WHERE id=? AND network_id=? AND revoked_at IS NULL AND status='AVAILABLE' AND current_task_id IS NULL",[taskId,nodeId,task.networkId]);if(nodeChanged.affectedRows!==1)throw new Error("Node is unavailable or belongs to another network");const [assigned]=await connection.execute<ResultSetHeader>("UPDATE tasks SET status='ASSIGNED',assigned_node_id=?,attempt=?,scheduler_score=?,scheduler_explanation=?,timeout_ms=?,error=NULL WHERE id=? AND (deadline_at IS NULL OR deadline_at>UTC_TIMESTAMP(3)) AND (next_eligible_at IS NULL OR next_eligible_at<=UTC_TIMESTAMP(3)) AND EXISTS(SELECT 1 FROM distributed_networks n WHERE n.id=tasks.network_id AND n.status='ACTIVE' AND (n.expires_at IS NULL OR STR_TO_DATE(n.expires_at,'%Y-%m-%dT%H:%i:%s.%fZ')>UTC_TIMESTAMP(3)))",[nodeId,attempt,score,explanation,timeoutMs,taskId]);if(assigned.affectedRows!==1)throw new Error("Task or network admission deadline expired during assignment");await connection.execute("INSERT INTO task_attempts(task_id,attempt,node_id,status,scheduler_score,scheduler_explanation,assigned_at,lease_expires_at) VALUES(?,?,?,'ASSIGNED',?,?,?,LEAST(TIMESTAMPADD(MICROSECOND,?,UTC_TIMESTAMP(3)),COALESCE((SELECT deadline_at FROM tasks WHERE id=?),TIMESTAMPADD(MICROSECOND,?,UTC_TIMESTAMP(3)))))",[taskId,attempt,nodeId,score,explanation,assignedAt,timeoutMs*1000,taskId,timeoutMs*1000]);return attempt;});}
  async setTaskRunning(taskId:string,nodeId:string,attempt:number){const accepted=await this.transaction(async connection=>{const now=this.now();const[result]=await connection.execute<ResultSetHeader>("UPDATE tasks SET status='RUNNING',started_at=? WHERE id=? AND assigned_node_id=? AND attempt=? AND status='ASSIGNED' AND EXISTS(SELECT 1 FROM task_attempts a WHERE a.task_id=tasks.id AND a.attempt=tasks.attempt AND a.node_id=tasks.assigned_node_id AND a.status='ASSIGNED' AND a.lease_expires_at>UTC_TIMESTAMP(3))",[now,taskId,nodeId,attempt]);if(result.affectedRows===1)await connection.execute("UPDATE task_attempts SET status='RUNNING',started_at=? WHERE task_id=? AND attempt=? AND node_id=? AND status='ASSIGNED'",[now,taskId,attempt,nodeId]);return result.affectedRows===1;});if(accepted)await this.metrics.sampleForTask(taskId);return accepted;}
  async completeTask(taskId:string,nodeId:string,attempt:number,result:unknown,executionTimeMs:number,resources:ResourceSnapshot,signal?:AbortSignal,receivedAt=new Date().toISOString()){
    const task=await this.getTask(taskId);
    const verificationId=await this.metrics.begin(taskId,nodeId,attempt,task?.kind==='TEST_COMPUTE'?'identity-schema-independent-recomputation':task?.kind==='C_OPTIMIZE_IR'?'identity-schema-authoritative-ir-transformation':'identity-schema-artifact-format',receivedAt);
    try{
    const verificationKey=`${taskId}:${attempt}`;
    if(!task||task.status!=="RUNNING"||task.assignedNodeId!==nodeId||Number(task.attempt)!==attempt)throw new StaleTaskResultError();
    const [nodes]=await this.pool.execute<RowDataPacket[]>("SELECT n.id FROM nodes n JOIN task_attempts a ON a.node_id=n.id AND a.task_id=n.current_task_id AND a.attempt=? WHERE n.id=? AND n.network_id=? AND n.revoked_at IS NULL AND n.status='BUSY' AND n.current_task_id=? AND a.status='RUNNING' AND a.lease_expires_at>UTC_TIMESTAMP(3)",[attempt,nodeId,task.networkId,taskId]);
    if(!nodes.length||this.verifyingTasks.has(verificationKey))throw new StaleTaskResultError();
    this.verifyingTasks.add(verificationKey);
    try{
      if(task.kind==="TEST_COMPUTE")result=await verifyPortableResult(task.payload,result,signal);
      else if(task.kind==="C_OPTIMIZE_IR")result=verifyIROptimization((task.payload as {function:IRFunction}).function,result);
      else {const job=await this.getCompilationJobForTask(taskId);const source=job?await this.getCompilationSource(job.id):null;if(!source)throw new Error("Compilation source unavailable");nativeArtifacts(source,result);}

      await this.transaction(async connection=>{
        const now=this.now();
        // NOW()/UTC_TIMESTAMP() are fixed at statement start in MySQL. Acquire
        // every scope lock first, then evaluate time in a separate statement.
        await connection.execute("SELECT t.id FROM tasks t JOIN nodes n ON n.id=t.assigned_node_id JOIN task_attempts a ON a.task_id=t.id AND a.attempt=t.attempt JOIN distributed_networks d ON d.id=t.network_id WHERE t.id=? FOR UPDATE",[taskId]);
        const [changed]=await connection.execute<ResultSetHeader>(
          "UPDATE tasks t JOIN nodes n ON n.id=t.assigned_node_id AND n.network_id=t.network_id JOIN task_attempts a ON a.task_id=t.id AND a.attempt=t.attempt AND a.node_id=t.assigned_node_id JOIN distributed_networks d ON d.id=t.network_id SET t.status='COMPLETED',t.completed_at=? WHERE t.id=? AND t.assigned_node_id=? AND t.attempt=? AND t.status='RUNNING' AND a.status='RUNNING' AND a.lease_expires_at>UTC_TIMESTAMP(3) AND n.revoked_at IS NULL AND n.status='BUSY' AND n.current_task_id=t.id AND d.status='ACTIVE' AND (d.expires_at IS NULL OR STR_TO_DATE(d.expires_at,'%Y-%m-%dT%H:%i:%s.%fZ')>UTC_TIMESTAMP(3))",
          [now,taskId,nodeId,attempt]);
        if(changed.affectedRows!==1)throw new StaleTaskResultError();
        await connection.execute("UPDATE task_attempts SET status='COMPLETED',completed_at=? WHERE task_id=? AND attempt=? AND node_id=? AND status='RUNNING'",[now,taskId,attempt,nodeId]);
        await connection.execute("INSERT INTO results(id,task_id,node_id,attempt,result_json,execution_time_ms,resource_json,created_at) VALUES(?,?,?,?,?,?,?,?)",[this.id("RESULT"),taskId,nodeId,attempt,JSON.stringify(result),executionTimeMs,JSON.stringify(resources),now]);
        await connection.execute("UPDATE nodes SET status='AVAILABLE',current_task_id=NULL,resource_json=?,last_heartbeat=? WHERE id=?",[JSON.stringify(resources),now,nodeId]);
        const [lease]=await connection.execute<RowDataPacket[]>("SELECT task_id FROM task_attempts WHERE task_id=? AND attempt=? AND node_id=? AND lease_expires_at>UTC_TIMESTAMP(3)",[taskId,attempt,nodeId]);
        if(!lease.length)throw new StaleTaskResultError();
        if(verificationId)await connection.execute("UPDATE result_verifications SET outcome=\'VERIFIED\',completed_at=? WHERE id=? AND outcome=\'PENDING\'",[now,verificationId]);
      });
    }finally{this.verifyingTasks.delete(verificationKey);}
    }catch(error){await this.metrics.finish(verificationId,['ECONNRESET','PROTOCOL_CONNECTION_LOST','ECONNREFUSED'].includes(String((error as {code?:string})?.code))?'FAILED':'REJECTED');throw error;}
  }
  async failOrRequeueNodeTasks(nodeId:string,error:string,failureReason="NETWORK_FAILURE"){await this.transaction(async connection=>{const timestamp=this.now();await connection.execute("UPDATE task_attempts a JOIN tasks t ON t.id=a.task_id AND t.attempt=a.attempt SET a.status='INTERRUPTED',a.completed_at=?,a.error=?,a.failure_reason=? WHERE a.node_id=? AND a.status IN ('ASSIGNED','RUNNING')",[timestamp,error,failureReason,nodeId]);await connection.execute("UPDATE tasks SET status=IF(attempt>=max_attempts,'FAILED','REQUEUED'),error=?,assigned_node_id=NULL,next_eligible_at=TIMESTAMPADD(MICROSECOND,LEAST(30000000,500000*POW(2,LEAST(6,GREATEST(0,attempt-1)))*(1+CONV(SUBSTRING(SHA2(CONCAT(id,':',attempt),256),1,4),16,10)/65535*.25)),UTC_TIMESTAMP(3)),completed_at=IF(attempt>=max_attempts,?,completed_at) WHERE assigned_node_id=? AND status IN ('ASSIGNED','RUNNING')",[error,timestamp,nodeId]);await connection.execute("UPDATE nodes SET current_task_id=NULL WHERE id=?",[nodeId]);});}
async failTask(taskId:string,nodeId:string,attempt:number,error:string,permanent=false,failureReason="TASK_FAILURE"){return this.transaction(async connection=>{const timestamp=this.now();const[result]=await connection.execute<ResultSetHeader>("UPDATE tasks SET status=IF(? OR attempt>=max_attempts,'FAILED','REQUEUED'),error=?,assigned_node_id=NULL,next_eligible_at=TIMESTAMPADD(MICROSECOND,LEAST(30000000,500000*POW(2,LEAST(6,GREATEST(0,attempt-1)))*(1+CONV(SUBSTRING(SHA2(CONCAT(id,':',attempt),256),1,4),16,10)/65535*.25)),UTC_TIMESTAMP(3)),completed_at=IF(? OR attempt>=max_attempts,?,completed_at) WHERE id=? AND assigned_node_id=? AND attempt=? AND status IN ('ASSIGNED','RUNNING')",[permanent,error,permanent,timestamp,taskId,nodeId,attempt]);if(result.affectedRows){const attemptStatus=error.includes("timed out")?"TIMED_OUT":"FAILED";await connection.execute("UPDATE task_attempts SET status=?,completed_at=?,error=?,failure_reason=? WHERE task_id=? AND attempt=? AND node_id=? AND status IN ('ASSIGNED','RUNNING')",[attemptStatus,timestamp,error,attemptStatus==="TIMED_OUT"?"TIMEOUT":failureReason,taskId,attempt,nodeId]);await connection.execute("UPDATE nodes SET status='AVAILABLE',current_task_id=NULL WHERE id=? AND status!='OFFLINE' AND revoked_at IS NULL",[nodeId]);}return result.affectedRows===1;});}
  async failUnassignableTask(taskId:string,error:string){await this.pool.execute("UPDATE tasks SET status='FAILED',error=?,completed_at=? WHERE id=? AND status IN ('QUEUED','REQUEUED')",[error,this.now(),taskId]);}
  async reconcileFailedJobs(){const[rows]=await this.pool.execute<RowDataPacket[]>(`SELECT DISTINCT j.id,t.error FROM compilation_jobs j JOIN tasks t ON (t.job_id=j.id OR t.id IN (SELECT bt.task_id FROM optimization_batch_tasks bt WHERE bt.batch_id=j.batch_id)) WHERE j.status IN ('SUBMITTED','DISTRIBUTING','CODE_GENERATING') AND t.status='FAILED'`);for(const row of rows){await this.failCompilationJob(String(row.id),String(row.error??"A distributed task failed"));await this.pool.execute("UPDATE optimization_batches SET status='FAILED',completed_at=? WHERE id=(SELECT batch_id FROM compilation_jobs WHERE id=?) AND status='DISTRIBUTING'",[this.now(),row.id]);}return rows.length;}
  private parseJson<T=unknown>(value:unknown):T{return(typeof value==="string"?JSON.parse(value):value) as T;}
}
