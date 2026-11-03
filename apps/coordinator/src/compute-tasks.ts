import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {testTaskSchema,type TestTaskPayload} from '@omnicompile/contracts';
import type {Pool,RowDataPacket} from 'mysql2/promise';
import {retryTransaction} from './transaction.js';

export const computeSubmissionSchema=z.object({payload:testTaskSchema}).strict();
export const computePageSchema=z.object({page:z.coerce.number().int().min(1).max(1_000_000).default(1)}).strict();
export class ComputeAdmissionError extends Error {readonly statusCode=409;readonly code='ACTIVE_COMPUTE_TASK';constructor(){super('Finish or cancel your active compute task before submitting another.');}}
const parse=(value:unknown)=>typeof value==='string'?JSON.parse(value):value;
const summaryColumns="id,status,attempt,created_at createdAt,started_at startedAt,completed_at completedAt,deadline_at deadlineAt,next_eligible_at nextEligibleAt,error,JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.operation')) operation";
export class ComputeTasks {
  constructor(private readonly pool:Pool){}
  async create(userId:string,networkId:string,payload:TestTaskPayload){
    return retryTransaction(this.pool,async connection=>{
      // Lock the existing owner row so concurrent submissions cannot both pass.
      const [users]=await connection.execute<RowDataPacket[]>('SELECT id FROM users WHERE id=? AND status=\'ACTIVE\' FOR UPDATE',[userId]);
      if(!users.length)throw new Error('Task owner is unavailable');
      const [active]=await connection.execute<RowDataPacket[]>("SELECT id FROM tasks WHERE user_id=? AND status IN ('QUEUED','REQUEUED','ASSIGNED','RUNNING') LIMIT 1",[userId]);
      if(active.length)throw new ComputeAdmissionError();
      const id=`TASK-${randomUUID()}`;
      await connection.execute("INSERT INTO tasks(id,session_id,network_id,user_id,kind,payload_json,required_capability,status,created_at,deadline_at) VALUES(?,NULL,?,?,'TEST_COMPUTE',?,'base','QUEUED',?,TIMESTAMPADD(SECOND,300,UTC_TIMESTAMP(3)))",[id,networkId,userId,JSON.stringify(payload),new Date().toISOString()]);
      return{id,status:'QUEUED'};
    });
  }
  async list(userId:string,page:number){
    const [[counts],[items]]=await Promise.all([this.pool.execute<RowDataPacket[]>("SELECT COUNT(*) total FROM tasks WHERE user_id=? AND kind='TEST_COMPUTE' AND job_id IS NULL",[userId]),this.pool.query<RowDataPacket[]>(`SELECT ${summaryColumns} FROM tasks WHERE user_id=? AND kind='TEST_COMPUTE' AND job_id IS NULL ORDER BY created_at DESC,id DESC LIMIT 10 OFFSET ?`,[userId,(page-1)*10])]);
    const totalItems=Number(counts[0]?.total??0);return{items,page,pageSize:10,totalItems,totalPages:Math.ceil(totalItems/10)};
  }
  async detail(id:string,userId:string,admin=false){
    const [tasks]=await this.pool.execute<RowDataPacket[]>(`SELECT ${summaryColumns},payload_json payload FROM tasks WHERE id=? AND kind='TEST_COMPUTE' AND job_id IS NULL AND ${admin?'user_id IS NOT NULL':'user_id=?'}`,[id,...(admin?[]:[userId])]);
    if(!tasks[0])return undefined;
    const [[results],[attempts]]=await Promise.all([this.pool.execute<RowDataPacket[]>('SELECT attempt,result_json result,execution_time_ms executionTimeMs,created_at createdAt FROM results WHERE task_id=? ORDER BY attempt DESC LIMIT 1',[id]),this.pool.execute<RowDataPacket[]>('SELECT attempt,status,assigned_at assignedAt,started_at startedAt,completed_at completedAt,lease_expires_at leaseExpiresAt,failure_reason failureReason,error FROM task_attempts WHERE task_id=? ORDER BY attempt',[id])]);
    const result=results[0];return{...tasks[0],payload:parse(tasks[0].payload),result:result?{...result,result:parse(result.result)}:null,attempts};
  }
}
