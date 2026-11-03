import type {FastifyInstance} from 'fastify';import type {Pool,RowDataPacket} from 'mysql2/promise';
type Scope={nodeId:string|null;networkId:string};
export function registerWorkerStatus(app:FastifyInstance,dependencies:{pool:Pool;authenticate:(credential:string)=>Promise<Scope|null>}){
  app.get('/api/worker/status',async(request,reply)=>{
    reply.header('Cache-Control','no-store');const authorization=request.headers.authorization,credential=request.cookies?.omnicompile_worker??(authorization?.startsWith('Bearer ')?authorization.slice(7):undefined),scope=credential?await dependencies.authenticate(credential):null;
    if(!scope?.nodeId)return reply.code(401).send({error:{code:'WORKER_AUTH_REQUIRED',message:'An active scoped worker enrollment is required.'}});
    const [rows]=await dependencies.pool.execute<RowDataPacket[]>(`SELECT n.id nodeId,n.network_id networkId,d.name networkName,
      COALESCE(SUM(CASE WHEN a.status='COMPLETED' AND COALESCE(a.failure_reason,'') NOT IN ('USER_PAUSED','USER_LEFT','SERVER_FAILURE') THEN 1 ELSE 0 END),0) completed,
      COALESCE(SUM(CASE WHEN a.status IN ('FAILED','TIMED_OUT','INTERRUPTED') AND COALESCE(a.failure_reason,'') NOT IN ('USER_PAUSED','USER_LEFT','SERVER_FAILURE') THEN 1 ELSE 0 END),0) failed
      FROM nodes n JOIN distributed_networks d ON d.id=n.network_id LEFT JOIN task_attempts a ON a.node_id=n.id WHERE n.id=? AND n.network_id=? AND n.revoked_at IS NULL GROUP BY n.id,n.network_id,d.name`,[scope.nodeId,scope.networkId]);
    const row=rows[0];if(!row)return reply.code(401).send({error:{code:'WORKER_AUTH_REQUIRED',message:'This worker enrollment is unavailable.'}});
    const completed=Number(row.completed),failed=Number(row.failed);if(!Number.isSafeInteger(completed)||!Number.isSafeInteger(failed)||completed<0||failed<0)throw new Error('Worker counters are invalid');
    return{nodeId:row.nodeId,networkId:row.networkId,networkName:row.networkName,completed,failed,reliabilityPercent:completed+failed?completed/(completed+failed)*100:null};
  });
}
