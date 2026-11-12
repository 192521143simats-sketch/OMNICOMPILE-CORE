import {createHash,randomBytes,randomUUID} from "node:crypto";
import type {Pool,PoolConnection,ResultSetHeader,RowDataPacket} from "mysql2/promise";
import type {CapabilityProfile,NodeStatus,ResourceSnapshot} from "@omnicompile/contracts";
import {retryTransaction} from './transaction.js';

export type WorkerType="BROWSER"|"NATIVE"|"ANDROID";
export class AdmissionError extends Error{constructor(readonly code:string,message:string,readonly statusCode:number){super(message);}}

const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
const token=()=>randomBytes(32).toString("base64url");
const id=(prefix:string)=>`${prefix}-${randomUUID()}`;
const now=()=>new Date().toISOString();
const alphaCode=(value:number)=>{let code="",number=value;while(number>0){number--;code=String.fromCharCode(65+number%26)+code;number=Math.floor(number/26);}return code;};
export type Page={page:number;pageSize:number};

export class NetworkService{
  constructor(private readonly pool:Pool){}

  async create(input:{name:string;description:string;expiresAt:string|null;maxNodes:number;requireAdminApproval?:boolean},adminId:string){
    return retryTransaction(this.pool,async connection=>{
      const [rows]=await connection.execute<RowDataPacket[]>("SELECT next_value nextValue FROM network_identity_sequence WHERE id=1 FOR UPDATE");
      const number=Number(rows[0]?.nextValue);
      if(!Number.isSafeInteger(number)||number<1||!Number.isSafeInteger(number+1))throw new Error("Network identity sequence is unavailable");
      const networkId=id("NETWORK"),publicId=id("NET"),joinToken=token(),createdAt=now(),networkCode=alphaCode(number);
      await connection.execute("UPDATE network_identity_sequence SET next_value=? WHERE id=1",[number+1]);
      await connection.execute("INSERT INTO distributed_networks(id,public_id,join_token_hash,name,description,status,created_by,created_at,expires_at,max_nodes,configuration_json,network_code,next_node_number,join_link_token,join_link_enabled) VALUES(?,?,?,?,?,'ACTIVE',?,?,?,?,?,?,1,?,TRUE)",[networkId,publicId,digest(joinToken),input.name,input.description,adminId,createdAt,input.expiresAt,input.maxNodes,JSON.stringify({requireAdminApproval:input.requireAdminApproval===true}),networkCode,joinToken]);
      return{id:networkId,publicId,networkCode,name:input.name,description:input.description,status:"ACTIVE",createdAt,expiresAt:input.expiresAt,maxNodes:input.maxNodes,joinToken};
    });
  }
  async disable(networkId:string){return retryTransaction(this.pool,async connection=>{
    const [rows]=await connection.execute<RowDataPacket[]>("SELECT id FROM distributed_networks WHERE id=? AND status='ACTIVE' FOR UPDATE",[networkId]);
    if(!rows[0])return false;const timestamp=now();
    await connection.execute("UPDATE distributed_networks SET status='DISABLED' WHERE id=?",[networkId]);
    await connection.execute("UPDATE worker_invitations SET revoked_at=? WHERE network_id=? AND revoked_at IS NULL AND consumed_at IS NULL",[timestamp,networkId]);
    await connection.execute("UPDATE network_enrollments SET status='REVOKED',consent_status='REVOKED',revoked_at=?,updated_at=? WHERE network_id=? AND status!='REVOKED'",[timestamp,timestamp,networkId]);
    await connection.execute("UPDATE nodes SET status='OFFLINE',revoked_at=?,current_task_id=NULL WHERE network_id=? AND revoked_at IS NULL",[timestamp,networkId]);return true;
  });}

  async byJoinToken(raw:string){const[rows]=await this.pool.execute<RowDataPacket[]>(`SELECT n.id,n.public_id publicId,n.name,n.description,n.status,n.created_at createdAt,n.expires_at expiresAt,n.max_nodes maxNodes,(SELECT COUNT(*) FROM nodes w WHERE w.network_id=n.id AND w.revoked_at IS NULL AND w.status IN ('ONLINE','AVAILABLE','BUSY')) nodeCount FROM distributed_networks n WHERE n.join_token_hash=?`,[digest(raw)]);const row=rows[0];if(!row)return null;const expired=Boolean(row.expiresAt)&&Date.parse(String(row.expiresAt))<=Date.now();return{id:String(row.id),publicId:String(row.publicId),name:String(row.name),description:String(row.description),status:expired?"EXPIRED":String(row.status),createdAt:String(row.createdAt),expiresAt:row.expiresAt?String(row.expiresAt):null,maxNodes:Number(row.maxNodes),nodeCount:Number(row.nodeCount),accepting:String(row.status)==="ACTIVE"&&!expired&&Number(row.nodeCount)<Number(row.maxNodes)};}
  async isActive(networkId:string){const[rows]=await this.pool.execute<RowDataPacket[]>("SELECT id FROM distributed_networks WHERE id=? AND status='ACTIVE' AND (expires_at IS NULL OR expires_at>?)",[networkId,now()]);return Boolean(rows[0]);}
  async adminJoinLink(networkId:string){const [rows]=await this.pool.execute<RowDataPacket[]>("SELECT id,join_link_token token,join_link_enabled enabled FROM distributed_networks WHERE id=?",[networkId]);return rows[0]?{networkId:String(rows[0].id),token:String(rows[0].token),enabled:Boolean(rows[0].enabled)}:null;}
  async setJoinLinkEnabled(networkId:string,enabled:boolean){return retryTransaction(this.pool,async connection=>{if(!await this.lockNetwork(connection,networkId))return null;await connection.execute("UPDATE distributed_networks SET join_link_enabled=? WHERE id=?",[enabled,networkId]);const [rows]=await connection.execute<RowDataPacket[]>("SELECT join_link_token token FROM distributed_networks WHERE id=?",[networkId]);return{networkId,token:String(rows[0]!.token),enabled};});}

  async issueInvitation(networkId:string,adminId:string,ttlMinutes=15,workerTypes:WorkerType[]=["BROWSER","NATIVE","ANDROID"]){
    if(!Number.isInteger(ttlMinutes)||ttlMinutes<1||ttlMinutes>1440||!workerTypes.length||workerTypes.some(type=>!["BROWSER","NATIVE","ANDROID"].includes(type)))throw new AdmissionError("INVALID_INVITATION","Check invitation expiry and worker types.",400);
    return retryTransaction(this.pool,async connection=>{
      const network=await this.lockNetwork(connection,networkId);if(!network)return null;
      const invitationId=id("INVITE"),rawToken=token(),createdAt=now(),expiresAt=new Date(Math.min(Date.now()+ttlMinutes*60_000,network.expires_at?Date.parse(String(network.expires_at)):Infinity)).toISOString();
      await connection.execute("INSERT INTO worker_invitations(id,network_id,token_hash,created_by,created_at,expires_at,allowed_worker_types) VALUES(?,?,?,?,?,?,?)",[invitationId,networkId,digest(rawToken),adminId,createdAt,expiresAt,JSON.stringify([...new Set(workerTypes)])]);
      return{id:invitationId,networkId,token:rawToken,expiresAt,workerTypes};
    });
  }
  async inspectJoinToken(raw:string){
    const [rows]=await this.pool.execute<RowDataPacket[]>("SELECT i.*,n.name,n.description,n.status,n.join_link_enabled,n.expires_at network_expiry,n.max_nodes maxNodes,(SELECT COUNT(*) FROM nodes w WHERE w.network_id=n.id AND w.revoked_at IS NULL AND w.status IN ('ONLINE','AVAILABLE','BUSY')) nodeCount FROM worker_invitations i JOIN distributed_networks n ON n.id=i.network_id WHERE i.token_hash=?",[digest(raw)]);
    const row=rows[0];if(!row){const info=await this.byJoinToken(raw);if(!info)return null;const [states]=await this.pool.execute<RowDataPacket[]>("SELECT join_link_enabled enabled FROM distributed_networks WHERE id=?",[info.id]);const enabled=Boolean(states[0]?.enabled),full=await this.usedCapacity(this.pool,info.id)>=info.maxNodes;return{...info,reusable:true,accepting:enabled&&info.accepting&&!full,joinLinkStatus:info.status!=="ACTIVE"?"EXPIRED":!enabled?"REVOKED":full?"FULL":"ACTIVE"};}
    const expired=Date.parse(String(row.expires_at))<=Date.now()||Boolean(row.network_expiry)&&Date.parse(String(row.network_expiry))<=Date.now();
    return{id:String(row.network_id),name:String(row.name),description:String(row.description),status:row.status,nodeCount:Number(row.nodeCount),maxNodes:Number(row.maxNodes),expiresAt:String(row.expires_at),invitationRequired:false,workerTypes:this.json(row.allowed_worker_types),accepting:row.status==="ACTIVE"&&Boolean(row.join_link_enabled)&&!expired&&!row.consumed_at&&!row.revoked_at&&Number(row.nodeCount)<Number(row.maxNodes),joinLinkStatus:!row.join_link_enabled?"REVOKED":undefined,invitationStatus:row.revoked_at?"REVOKED":row.consumed_at?"CONSUMED":expired?"EXPIRED":"PENDING"};
  }
  async listInvitations(networkId:string){
    const [rows]=await this.pool.execute<RowDataPacket[]>(`
      SELECT i.id,i.created_at createdAt,i.expires_at expiresAt,i.allowed_worker_types workerTypes,
        i.revoked_at revokedAt,i.consumed_at consumedAt,i.consumed_enrollment_id enrollmentId,n.id nodeId
      FROM worker_invitations i
      LEFT JOIN nodes n ON n.enrollment_id=i.consumed_enrollment_id AND n.network_id=i.network_id
      WHERE i.network_id=?
      ORDER BY i.created_at DESC,i.id DESC LIMIT 100`,[networkId]);
    const checkedAt=Date.now();
    return rows.map(row=>({
      id:String(row.id),
      status:row.revokedAt?'REVOKED':row.consumedAt?'EXHAUSTED':
        Date.parse(String(row.expiresAt))<=checkedAt?'EXPIRED':'ACTIVE',
      createdAt:String(row.createdAt),
      expiresAt:String(row.expiresAt),
      workerTypes:this.json(row.workerTypes),
      enrollmentId:row.enrollmentId?String(row.enrollmentId):null,
      nodeId:row.nodeId?String(row.nodeId):null
    }));
  }
  async revokeInvitation(invitationId:string){const [result]=await this.pool.execute<ResultSetHeader>("UPDATE worker_invitations SET revoked_at=? WHERE id=? AND revoked_at IS NULL AND consumed_at IS NULL",[now(),invitationId]);return result.affectedRows===1;}
  async createEnrollment(rawInvite:string,workerType:WorkerType,deviceIdentity:string,consent=false){
    if(consent!==true)throw new AdmissionError("CONSENT_REQUIRED","Explicit worker consent is required.",400);
    const [links]=await this.pool.execute<RowDataPacket[]>("SELECT id networkId FROM distributed_networks WHERE join_token_hash=?",[digest(rawInvite)]);
    const reusable=Boolean(links[0]);
    const [identity]=reusable?[links]:await this.pool.execute<RowDataPacket[]>("SELECT network_id networkId FROM worker_invitations WHERE token_hash=?",[digest(rawInvite)]);
    if(!identity[0])throw new AdmissionError("JOIN_LINK_EXPIRED","This join link has expired or is unavailable. Contact the network administrator.",410);
    return retryTransaction(this.pool,async connection=>{
      const networkId=String(identity[0]!.networkId),network=await this.lockNetwork(connection,networkId);
      const [rows]=await connection.execute<RowDataPacket[]>("SELECT * FROM worker_invitations WHERE token_hash=? AND network_id=? FOR UPDATE",[digest(rawInvite),networkId]),invite=rows[0];
      if(reusable){if(!network||!network.join_link_enabled||network.join_token_hash!==digest(rawInvite))throw new AdmissionError("JOIN_LINK_EXPIRED","This network join link has expired or been revoked. Contact the network administrator.",410);}
      else{if(!network||!network.join_link_enabled||!invite||invite.consumed_at||invite.revoked_at||Date.parse(String(invite.expires_at))<=Date.now())throw new AdmissionError("INVITATION_UNAVAILABLE","The invitation is invalid, expired, revoked, or already used.",410);
      if(!this.json(invite.allowed_worker_types).includes(workerType))throw new AdmissionError("WORKER_TYPE_NOT_ALLOWED","This invitation does not permit that worker type.",403);}
      if(!network)throw new AdmissionError("JOIN_LINK_EXPIRED","This network is unavailable.",410);
      if(await this.usedCapacity(connection,networkId)>=Number(network.max_nodes))throw new AdmissionError("NETWORK_FULL","All worker slots are occupied or reserved. Try again after a slot is released.",409);
      const approvalStatus=this.json(network.configuration_json)?.requireAdminApproval===true?'PENDING':'APPROVED';
      const enrollmentId=id("ENROLLMENT"),credential=token(),createdAt=now(),expiresAt=new Date(Math.min(Date.now()+30*24*3_600_000,network.expires_at?Date.parse(String(network.expires_at)):Infinity)).toISOString(),deadline=new Date(Math.min(Date.now()+(approvalStatus==='PENDING'?24*60:10)*60_000,Date.parse(expiresAt))).toISOString();
      await connection.execute("INSERT INTO network_enrollments(id,network_id,device_identity_hash,consent_status,status,worker_type,credential_hash,created_at,updated_at,expires_at,registration_deadline,approval_status) VALUES(?,?,?,'ACCEPTED','PENDING',?,?,?,?,?,?,?)",[enrollmentId,networkId,digest(deviceIdentity),workerType,digest(credential),createdAt,createdAt,expiresAt,deadline,approvalStatus]);
      if(!reusable)await connection.execute("UPDATE worker_invitations SET consumed_at=?,consumed_enrollment_id=? WHERE id=?",[createdAt,enrollmentId,invite!.id]);
      return{enrollmentId,networkId,credential,expiresAt,approvalStatus};
    });
  }
  private async lockNetwork(connection:PoolConnection,networkId:string){const [rows]=await connection.execute<RowDataPacket[]>("SELECT * FROM distributed_networks WHERE id=? FOR UPDATE",[networkId]);const row=rows[0];return row&&row.status==="ACTIVE"&&(!row.expires_at||Date.parse(String(row.expires_at))>Date.now())?row:null;}
  private async usedCapacity(connection:Pick<PoolConnection,"execute">,networkId:string){const [rows]=await connection.execute<RowDataPacket[]>("SELECT (SELECT COUNT(*) FROM nodes WHERE network_id=? AND revoked_at IS NULL AND status IN ('ONLINE','AVAILABLE','BUSY'))+(SELECT COUNT(*) FROM network_enrollments WHERE network_id=? AND status='PENDING' AND approval_status!='REJECTED' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?) AND (registration_deadline IS NULL OR registration_deadline>?)) total",[networkId,networkId,now(),now()]);return Number(rows[0]?.total??0);}

  async authenticateCredential(raw:string){const[rows]=await this.pool.execute<RowDataPacket[]>(`SELECT e.id enrollmentId,e.network_id networkId,e.worker_type workerType,e.approval_status approvalStatus,e.status,e.expires_at expiresAt,e.registration_deadline registrationDeadline,n.status networkStatus,n.expires_at networkExpiresAt,w.id nodeId,w.status nodeStatus FROM network_enrollments e JOIN distributed_networks n ON n.id=e.network_id LEFT JOIN nodes w ON w.enrollment_id=e.id WHERE e.credential_hash=? AND e.status IN ('PENDING','ACTIVE') AND e.revoked_at IS NULL AND e.consent_status='ACCEPTED' AND (w.id IS NULL OR w.revoked_at IS NULL)`,[digest(raw)]);const row=rows[0];if(!row||row.status==="PENDING"&&row.registrationDeadline&&Date.parse(String(row.registrationDeadline))<=Date.now()||row.networkStatus!=="ACTIVE"||(row.expiresAt&&Date.parse(String(row.expiresAt))<=Date.now())||(row.networkExpiresAt&&Date.parse(String(row.networkExpiresAt))<=Date.now()))return null;return{enrollmentId:String(row.enrollmentId),networkId:String(row.networkId),workerType:String(row.workerType) as WorkerType,approvalStatus:String(row.approvalStatus),nodeId:row.nodeId?String(row.nodeId):null,nodeStatus:row.nodeStatus?String(row.nodeStatus) as NodeStatus:null};}

  async setAdmission(networkId:string,requireAdminApproval:boolean){return retryTransaction(this.pool,async connection=>{if(!await this.lockNetwork(connection,networkId))return null;await connection.execute("UPDATE distributed_networks SET configuration_json=JSON_SET(configuration_json,'$.requireAdminApproval',CAST(? AS JSON)) WHERE id=?",[JSON.stringify(requireAdminApproval),networkId]);return{requireAdminApproval};});}
  async listEnrollments(networkId:string,page:Page){const [[items],[count]]=await Promise.all([this.pool.execute<RowDataPacket[]>("SELECT e.id enrollmentId,e.network_id networkId,e.worker_type workerType,e.status,e.approval_status approvalStatus,e.execution_location executionLocation,e.created_at createdAt,e.expires_at expiresAt,w.id nodeId FROM network_enrollments e LEFT JOIN nodes w ON w.enrollment_id=e.id WHERE e.network_id=? ORDER BY e.created_at DESC,e.id DESC LIMIT ? OFFSET ?",[networkId,page.pageSize,(page.page-1)*page.pageSize]),this.pool.execute<RowDataPacket[]>('SELECT COUNT(*) total FROM network_enrollments WHERE network_id=?',[networkId])]);return this.page(items,page,Number(count[0]?.total??0));}
  async decideApproval(enrollmentId:string,approved:boolean,adminId:string,executionLocation:"LOCAL"|"CLOUD"="LOCAL"){
    const [ids]=await this.pool.execute<RowDataPacket[]>('SELECT network_id networkId FROM network_enrollments WHERE id=?',[enrollmentId]);if(!ids[0])return null;
    return retryTransaction(this.pool,async connection=>{
      if(!await this.lockNetwork(connection,String(ids[0]!.networkId)))return null;
      const [rows]=await connection.execute<RowDataPacket[]>('SELECT * FROM network_enrollments WHERE id=? FOR UPDATE',[enrollmentId]);const row=rows[0];
      if(!row||row.revoked_at||row.approval_status!=='PENDING'||row.status!=='PENDING'||Date.parse(String(row.expires_at))<=Date.now()||row.registration_deadline&&Date.parse(String(row.registration_deadline))<=Date.now())return null;
      const approvalStatus=approved?'APPROVED':'REJECTED',timestamp=now();
      await connection.execute('UPDATE network_enrollments SET approval_status=?,execution_location=?,registration_deadline=?,updated_at=? WHERE id=?',[approvalStatus,executionLocation,new Date(Math.min(Date.now()+10*60_000,Date.parse(String(row.expires_at)))).toISOString(),timestamp,enrollmentId]);
      await this.audit(connection,adminId,approved?'ENROLLMENT_APPROVED':'ENROLLMENT_REJECTED','ENROLLMENT',enrollmentId);
      return{enrollmentId,approvalStatus,executionLocation};
    });
  }
  async rotateJoinLink(networkId:string,adminId:string){return retryTransaction(this.pool,async connection=>{const network=await this.lockNetwork(connection,networkId);if(!network)return null;const raw=token();await connection.execute('UPDATE distributed_networks SET join_token_hash=?,join_link_token=? WHERE id=?',[digest(raw),raw,networkId]);await this.audit(connection,adminId,'JOIN_LINK_ROTATED','NETWORK',networkId);return{networkId,token:raw,enabled:Boolean(network.join_link_enabled)};});}
  async rotateCredential(enrollmentId:string,adminId:string|null,expectedCredential?:string){
    const [ids]=await this.pool.execute<RowDataPacket[]>('SELECT network_id networkId FROM network_enrollments WHERE id=?',[enrollmentId]);if(!ids[0])return null;
    return retryTransaction(this.pool,async connection=>{
      if(!await this.lockNetwork(connection,String(ids[0]!.networkId)))return null;
      const [rows]=await connection.execute<RowDataPacket[]>('SELECT * FROM network_enrollments WHERE id=? FOR UPDATE',[enrollmentId]);const row=rows[0];
      if(!row||row.revoked_at||row.approval_status==='REJECTED'||!['ACTIVE','PENDING'].includes(String(row.status))||Date.parse(String(row.expires_at))<=Date.now()||row.status==='PENDING'&&row.registration_deadline&&Date.parse(String(row.registration_deadline))<=Date.now()||expectedCredential&&row.credential_hash!==digest(expectedCredential))return null;
      const credential=token();await connection.execute('UPDATE network_enrollments SET credential_hash=?,updated_at=? WHERE id=?',[digest(credential),now(),enrollmentId]);
      const [nodes]=await connection.execute<RowDataPacket[]>('SELECT id FROM nodes WHERE enrollment_id=? FOR UPDATE',[enrollmentId]);
      await this.audit(connection,adminId??enrollmentId,'WORKER_CREDENTIAL_ROTATED','ENROLLMENT',enrollmentId,adminId?'ADMIN':'WORKER');
      return{enrollmentId,credential,expiresAt:String(row.expires_at),nodeId:nodes[0]?String(nodes[0].id):null,workerType:String(row.worker_type)};
    });
  }
  private async audit(connection:PoolConnection,actorId:string,event:string,targetType:string,targetId:string,actorType='ADMIN'){await connection.execute('INSERT INTO audit_events(id,actor_type,actor_id,event_type,target_type,target_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?)',[id('AUDIT'),actorType,actorId,event,targetType,targetId,'{}',now()]);}

  async register(rawCredential:string,profile:CapabilityProfile){
    const identity=await this.authenticateCredential(rawCredential);if(!identity||identity.workerType!==profile.workerType)return null;
    if(identity.approvalStatus==='PENDING')throw new AdmissionError('WORKER_APPROVAL_PENDING','Waiting for administrator approval. Retry with the same enrollment.',409);
    if(identity.approvalStatus!=='APPROVED')return null;
    if(profile.workerType!=="NATIVE"&&(profile.operations.nativeCompilation||Object.values(profile.runtimes).some(Boolean)||Object.values(profile.toolchains).some(tool=>tool.available)))return null;
    return retryTransaction(this.pool,async connection=>{
      const network=await this.lockNetwork(connection,identity.networkId);if(!network)return null;
      const [enrollments]=await connection.execute<RowDataPacket[]>("SELECT * FROM network_enrollments WHERE id=? AND credential_hash=? FOR UPDATE",[identity.enrollmentId,digest(rawCredential)]),enrollment=enrollments[0];
      if(!enrollment||enrollment.approval_status!=='APPROVED'||enrollment.revoked_at||!["PENDING","ACTIVE"].includes(String(enrollment.status))||enrollment.worker_type!==profile.workerType||enrollment.consent_status!=="ACCEPTED"||enrollment.expires_at&&Date.parse(String(enrollment.expires_at))<=Date.now()||enrollment.status==="PENDING"&&enrollment.registration_deadline&&Date.parse(String(enrollment.registration_deadline))<=Date.now())return null;
      const [nodes]=await connection.execute<RowDataPacket[]>("SELECT id,status,revoked_at FROM nodes WHERE enrollment_id=? FOR UPDATE",[identity.enrollmentId]),node=nodes[0];
      if(node?.revoked_at)return null;
      const alreadyConnected=Boolean(node&&["ONLINE","AVAILABLE","BUSY"].includes(String(node.status)));
      // The current pending enrollment owns one reservation; reconnecting offline nodes own none.
      const reserved=enrollment.status==="PENDING"?1:0;
      if(!alreadyConnected&&await this.usedCapacity(connection,identity.networkId)-reserved>=Number(network.max_nodes))return null;
      const timestamp=now();
      if(node){await connection.execute("UPDATE nodes SET status=IF(status='BUSY','BUSY','ONLINE'),profile_json=?,last_heartbeat=?,disconnected_at=NULL WHERE id=?",[JSON.stringify(profile),timestamp,node.id]);return{nodeId:String(node.id),networkId:identity.networkId};}
      const number=Number(network.next_node_number);
      if(!Number.isSafeInteger(number)||number<1||number>=2_147_483_647)throw new Error("Node identity sequence is unavailable");
      const nodeId=`NODE-${String(network.network_code)}${String(number).padStart(3,"0")}`;
      await connection.execute("UPDATE distributed_networks SET next_node_number=? WHERE id=?",[number+1,identity.networkId]);
      await connection.execute("INSERT INTO nodes(id,session_id,invitation_id,role,status,profile_json,worker_token_hash,registered_at,last_heartbeat,network_id,enrollment_id,worker_type) VALUES(?,NULL,NULL,'WORKER','ONLINE',?,?,?,?,?,?,?)",[nodeId,JSON.stringify(profile),digest(token()),timestamp,timestamp,identity.networkId,identity.enrollmentId,identity.workerType]);
      await connection.execute("UPDATE network_enrollments SET status='ACTIVE',updated_at=? WHERE id=?",[timestamp,identity.enrollmentId]);
      return{nodeId,networkId:identity.networkId};
    });
  }

  async leave(rawCredential:string){const auth=await this.authenticateCredential(rawCredential);if(!auth)return null;return this.revokeEnrollment(auth.enrollmentId);}
  async revokeNode(nodeId:string|null,enrollmentId?:string){
    if(!enrollmentId){const [rows]=await this.pool.execute<RowDataPacket[]>("SELECT enrollment_id enrollmentId FROM nodes WHERE id=?",[nodeId]);enrollmentId=rows[0]?.enrollmentId?String(rows[0].enrollmentId):undefined;}
    return enrollmentId?Boolean(await this.revokeEnrollment(enrollmentId)):false;
  }
  private async revokeEnrollment(enrollmentId:string){
    const [identities]=await this.pool.execute<RowDataPacket[]>("SELECT network_id networkId FROM network_enrollments WHERE id=?",[enrollmentId]);
    if(!identities[0])return null;const networkId=String(identities[0].networkId);
    return retryTransaction(this.pool,async connection=>{
      // Same lock order as registration; resolve the node only after holding enrollment.
      await connection.execute("SELECT id FROM distributed_networks WHERE id=? FOR UPDATE",[networkId]);
      const [enrollments]=await connection.execute<RowDataPacket[]>("SELECT status FROM network_enrollments WHERE id=? AND network_id=? FOR UPDATE",[enrollmentId,networkId]);
      if(!enrollments[0]||enrollments[0].status==='REVOKED')return null;
      const [nodes]=await connection.execute<RowDataPacket[]>("SELECT id FROM nodes WHERE enrollment_id=? FOR UPDATE",[enrollmentId]);
      const nodeId=nodes[0]?String(nodes[0].id):null,timestamp=now();
      await connection.execute("UPDATE network_enrollments SET status='REVOKED',consent_status='REVOKED',revoked_at=?,updated_at=? WHERE id=?",[timestamp,timestamp,enrollmentId]);
      if(nodeId)await connection.execute("UPDATE nodes SET status='OFFLINE',revoked_at=?,current_task_id=NULL WHERE id=?",[timestamp,nodeId]);
      return{nodeId,enrollmentId,networkId};
    });
  }

async listNetworks(page:Page,activeOnly=false){const offset=(page.page-1)*page.pageSize,where=activeOnly?"WHERE n.status='ACTIVE' AND (n.expires_at IS NULL OR n.expires_at>?)":"",params=activeOnly?[now(),page.pageSize,offset]:[page.pageSize,offset],countParams=activeOnly?[now()]:[];const[[items],[count]]=await Promise.all([this.pool.execute<RowDataPacket[]>(`SELECT n.id,n.public_id publicId,n.network_code networkCode,n.join_link_enabled joinLinkEnabled,n.name,n.description,n.status,n.created_at createdAt,n.expires_at expiresAt,n.max_nodes maxNodes,SUM(IF(w.status IN ('ONLINE','AVAILABLE','BUSY'),1,0)) nodeCount,COALESCE(JSON_ARRAYAGG(IF(w.id IS NULL,NULL,JSON_OBJECT('id',w.id,'status',w.status,'workerType',w.worker_type,'lastHeartbeat',w.last_heartbeat))),JSON_ARRAY()) nodes FROM distributed_networks n LEFT JOIN nodes w ON w.network_id=n.id AND w.revoked_at IS NULL ${where} GROUP BY n.id ORDER BY n.created_at DESC LIMIT ? OFFSET ?`,params),this.pool.execute<RowDataPacket[]>(`SELECT COUNT(*) total FROM distributed_networks n ${where}`,countParams)]);return this.page(items.map((item:any)=>({...item,nodes:(typeof item.nodes==="string"?JSON.parse(item.nodes):item.nodes).filter(Boolean)})),page,Number(count[0]?.total??0));}
  async listNodes(page:Page,networkId?:string){const offset=(page.page-1)*page.pageSize,where=`WHERE n.status='ACTIVE' AND (n.expires_at IS NULL OR n.expires_at>?) AND w.revoked_at IS NULL ${networkId?"AND w.network_id=?":""}`,countParams=networkId?[now(),networkId]:[now()],params=[...countParams,page.pageSize,offset];const[[items],[count]]=await Promise.all([this.pool.execute<RowDataPacket[]>(`SELECT w.id,w.network_id networkId,n.name networkName,w.worker_type workerType,w.status,w.profile_json profileJson,w.resource_json resourceJson,w.registered_at registeredAt,w.last_heartbeat lastHeartbeat,w.current_task_id currentTaskId,w.revoked_at revokedAt,(SELECT COUNT(*) FROM task_attempts a WHERE a.node_id=w.id AND a.status='COMPLETED') tasksCompleted,(SELECT COUNT(*) FROM task_attempts a WHERE a.node_id=w.id AND a.status IN ('FAILED','TIMED_OUT','INTERRUPTED')) failures FROM nodes w JOIN distributed_networks n ON n.id=w.network_id ${where} ORDER BY w.registered_at DESC LIMIT ? OFFSET ?`,params),this.pool.execute<RowDataPacket[]>(`SELECT COUNT(*) total FROM nodes w JOIN distributed_networks n ON n.id=w.network_id ${where}`,countParams)]);return this.page(items.map(({profileJson,resourceJson,...row})=>({...row,profile:this.json(profileJson),resources:resourceJson?this.json(resourceJson):null})),page,Number(count[0]?.total??0));}
  async listTasks(page:Page,networkId?:string){const offset=(page.page-1)*page.pageSize,where=networkId?"WHERE t.network_id=?":"",params=networkId?[networkId,page.pageSize,offset]:[page.pageSize,offset],countParams=networkId?[networkId]:[];const[[items],[count]]=await Promise.all([this.pool.execute<RowDataPacket[]>(`SELECT t.id,t.network_id networkId,n.name networkName,t.kind,t.status,t.required_capability requiredCapability,t.assigned_node_id assignedNodeId,t.attempt,t.created_at createdAt,t.started_at startedAt,t.completed_at completedAt,t.error,(SELECT COUNT(*) FROM task_attempts a WHERE a.task_id=t.id) attemptCount FROM tasks t LEFT JOIN distributed_networks n ON n.id=t.network_id ${where} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,params),this.pool.execute<RowDataPacket[]>(`SELECT COUNT(*) total FROM tasks t ${where}`,countParams)]);return this.page(items,page,Number(count[0]?.total??0));}
  async taskDetails(taskId:string){const[taskRows]=await this.pool.execute<RowDataPacket[]>("SELECT id,network_id networkId,kind,status,required_capability requiredCapability,assigned_node_id assignedNodeId,attempt,created_at createdAt,started_at startedAt,completed_at completedAt,error FROM tasks WHERE id=?",[taskId]);if(!taskRows[0])return null;const[attempts]=await this.pool.execute<RowDataPacket[]>("SELECT attempt,node_id nodeId,status,scheduler_score schedulerScore,scheduler_explanation schedulerExplanation,assigned_at assignedAt,lease_expires_at leaseExpiresAt,failure_reason failureReason,started_at startedAt,completed_at completedAt,error FROM task_attempts WHERE task_id=? ORDER BY attempt",[taskId]);return{...taskRows[0],attempts};}
  async listJobs(page:Page,userId?:string){const offset=(page.page-1)*page.pageSize,where=userId?"WHERE j.user_id=?":"",params=userId?[userId,page.pageSize,offset]:[page.pageSize,offset],countParams=userId?[userId]:[];const[[items],[count]]=await Promise.all([this.pool.execute<RowDataPacket[]>(`SELECT j.id,j.user_id userId,j.network_id networkId,n.name networkName,n.network_code networkCode,j.language,j.source_name sourceName,j.status,j.stage,j.error,j.created_at createdAt,j.completed_at completedAt,(SELECT a.id FROM artifacts a WHERE a.job_id=j.id AND a.artifact_type='BUILD_REPORT_PDF' LIMIT 1) artifactId,(SELECT a.file_name FROM artifacts a WHERE a.job_id=j.id AND a.artifact_type='BUILD_REPORT_PDF' LIMIT 1) fileName,(SELECT GROUP_CONCAT(DISTINCT ta.node_id ORDER BY ta.node_id SEPARATOR ',') FROM task_attempts ta JOIN tasks tx ON tx.id=ta.task_id WHERE tx.job_id=j.id OR tx.id IN (SELECT obt.task_id FROM optimization_batch_tasks obt WHERE obt.batch_id=j.batch_id)) participatingNodeIds FROM compilation_jobs j LEFT JOIN distributed_networks n ON n.id=j.network_id ${where} ORDER BY j.created_at DESC LIMIT ? OFFSET ?`,params),this.pool.execute<RowDataPacket[]>(`SELECT COUNT(*) total FROM compilation_jobs j ${where}`,countParams)]);return this.page(items.map((item:any)=>({...item,participatingNodes:item.participatingNodeIds?String(item.participatingNodeIds).split(","):[]})),page,Number(count[0]?.total??0));}
  private page(items:unknown[],page:Page,totalItems:number){return{items,page:page.page,pageSize:page.pageSize,totalItems,totalPages:Math.max(1,Math.ceil(totalItems/page.pageSize))};}
  private json(value:unknown){return typeof value==="string"?JSON.parse(value):value;}
}
