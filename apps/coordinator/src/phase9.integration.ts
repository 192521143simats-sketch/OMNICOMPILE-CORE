import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import mysql from 'mysql2/promise';
import WebSocket from 'ws';
import type {CapabilityProfile} from '@omnicompile/contracts';
import {NetworkService} from './networks.js';
import {applyMigrations,type Migration} from './migrations.js';
import type {Pool} from 'mysql2/promise';
// @ts-ignore Integration runner is intentionally outside the coordinator package.
import {assertIsolatedTarget,verifyIsolatedCoordinator} from '../../../scripts/Integration-Target.mjs';

const target=assertIsolatedTarget(process.env);await verifyIsolatedCoordinator(target);
const base=process.env.OMNICOMPILE_TEST_BASE!;
async function request(path:string,body?:unknown,cookie?:string,bearer?:string){return fetch(base+path,{method:body===undefined?'GET':'POST',headers:{origin:process.env.PUBLIC_BASE_URL!,...(body===undefined?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{}),...(bearer?{authorization:`Bearer ${bearer}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});}
const login=await request('/api/auth/login',{identifier:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!.split(';')[0]!;
const created=await request('/api/admin/networks',{name:'Phase9 controlled admission',maxNodes:3,requireAdminApproval:true},cookie);assert.equal(created.status,201);const network=await created.json() as any;
const joinToken=network.joinUrl.split('/').at(-1);
const accepted=await request(`/api/join/${joinToken}/accept`,{consent:true,workerType:'NATIVE',deviceIdentity:'phase9-native-device'});assert.equal(accepted.status,201);const enrollment=await accepted.json() as any;
assert.equal(enrollment.approvalStatus,'PENDING','new gated worker must await administrator authorization');
const pool=mysql.createPool({host:process.env.DB_HOST!,port:Number(process.env.DB_PORT),database:process.env.DB_NAME!,user:process.env.DB_USER!,password:process.env.DB_PASSWORD!});
const profile:CapabilityProfile={workerType:'NATIVE',deviceType:'DESKTOP',cpuModel:'Logical admission security fixture',logicalCores:1,totalMemoryBytes:0,operatingSystem:'Test',architecture:'x64',runtimes:{c:false,python:false,java:false},toolchains:{c:{available:false},python:{available:false},java:{available:false}},operations:{irOptimization:true,staticAnalysis:true,browserCompute:true,nativeCompilation:false}};
async function registerSocket(credential:string){return new Promise<{message:any;closeCode:number}>((resolve,reject)=>{const socket=new WebSocket(base.replace('http:','ws:')+'/ws/worker',{headers:{authorization:`Bearer ${credential}`}});let message:any;const timer=setTimeout(()=>{socket.terminate();reject(new Error('Worker socket admission timed out'));},8000);socket.on('error',reject);socket.on('open',()=>socket.send(JSON.stringify({protocolVersion:2,type:'register',profile})));socket.on('message',raw=>{message=JSON.parse(raw.toString());});socket.on('close',closeCode=>{clearTimeout(timer);resolve({message,closeCode});});});}
try{
 const migrationModules=[['0001-existing-schema','existingSchemaMigration'],['0002-worker-invitations','workerInvitationMigration'],['0003-reusable-network-links','reusableNetworkLinkMigration'],['0004-task-attempt-leases','taskAttemptLeaseMigration'],['0005-task-cancellation','taskCancellationMigration'],['0006-task-policy-integrity','taskPolicyIntegrityMigration'],['0007-attempt-failure-reasons','attemptFailureReasonMigration'],['0008-compute-ownership','computeOwnershipMigration'],['0009-user-preferences','userPreferencesMigration'],['0010-worker-approval','workerApprovalMigration'],['0011-compiler-metrics','compilerMetricsMigration']];
 const plan:Migration[]=await Promise.all(migrationModules.map(async([file,name])=>(await import(`./migrations/${file}.mjs`))[name!]())) as Migration[];
 await applyMigrations(pool,target.database,plan,'check');
 const ledger=await pool.getConnection();
 // Faults remain uncommitted on this test-owned connection; the coordinator sees the valid ledger.
 const scopedPool={getConnection:async()=>new Proxy(ledger,{get(target,key){if(key==='release')return()=>{};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}})} as unknown as Pool;
 try{
  await ledger.beginTransaction();await ledger.execute('DELETE FROM schema_migrations WHERE id=?',[plan.at(-1)!.id]);
  const [before]=await ledger.query('SELECT id,checksum FROM schema_migrations ORDER BY id');await assert.rejects(applyMigrations(scopedPool,target.database,plan,'check'),/pending migrations/);const [after]=await ledger.query('SELECT id,checksum FROM schema_migrations ORDER BY id');assert.deepEqual(after,before,'check mode cannot apply the missing migration');await ledger.rollback();
  await ledger.beginTransaction();await ledger.execute('UPDATE schema_migrations SET checksum=? WHERE id=?',['0'.repeat(64),plan.at(-1)!.id]);await assert.rejects(applyMigrations(scopedPool,target.database,plan,'check'),/definition has changed/);const [unchanged]=await ledger.query<any[]>('SELECT checksum FROM schema_migrations WHERE id=?',[plan.at(-1)!.id]);assert.equal(unchanged[0].checksum,'0'.repeat(64));await ledger.rollback();
 }finally{await ledger.rollback();ledger.release();}
 await applyMigrations(pool,target.database,plan,'check');
 const service=new NetworkService(pool);const scope=await service.authenticateCredential(enrollment.workerCredential);assert.equal((scope as any)?.approvalStatus,'PENDING');
 const pending=await registerSocket(enrollment.workerCredential);assert.equal(pending.message.code,'WORKER_APPROVAL_PENDING');assert.equal(pending.closeCode,1013,'approval wait must remain recoverable');
 await assert.rejects(service.register(enrollment.workerCredential,profile),{code:'WORKER_APPROVAL_PENDING'});
 const [nodes]=await pool.query<any[]>('SELECT id FROM nodes WHERE enrollment_id=?',[enrollment.enrollmentId]);assert.equal(nodes.length,0);
 assert.equal((await request(`/api/admin/enrollments/${enrollment.enrollmentId}/approval`,{approved:true})).status,401);
 assert.equal((await request(`/api/admin/enrollments/${enrollment.enrollmentId}/approval`,{approved:true},cookie)).status,200);
 const registered=await service.register(enrollment.workerCredential,profile);assert.ok(registered);
 const rotated=await request(`/api/admin/enrollments/${enrollment.enrollmentId}/rotate-credential`,{},cookie);assert.equal(rotated.status,200);const replacement=await rotated.json() as any;assert.notEqual(replacement.workerCredential,enrollment.workerCredential);assert.equal(await service.authenticateCredential(enrollment.workerCredential),null);assert.equal((await service.authenticateCredential(replacement.workerCredential))?.enrollmentId,enrollment.enrollmentId);
 assert.equal((await service.register(replacement.workerCredential,profile))?.nodeId,registered.nodeId,'rotation must preserve scoped worker identity');
 const selfRotated=await request('/api/worker/rotate-credential',{},undefined,replacement.workerCredential);assert.equal(selfRotated.status,200);const self=await selfRotated.json() as any;assert.equal(await service.authenticateCredential(replacement.workerCredential),null);assert.equal((await service.authenticateCredential(self.workerCredential))?.nodeId,registered.nodeId);
 const raced=await (await request(`/api/join/${joinToken}/accept`,{consent:true,workerType:'ANDROID',deviceIdentity:'phase9-decision-race'})).json() as any;
 const approvals=await Promise.all([true,false].map(approved=>request(`/api/admin/enrollments/${raced.enrollmentId}/approval`,{approved},cookie)));assert.deepEqual(approvals.map(r=>r.status).sort(),[200,409]);
 const result=await (await request('/api/enrollments/status',undefined,undefined,raced.workerCredential)).json() as any;assert.ok(['APPROVED','REJECTED'].includes(result.approvalStatus));
 const rejected=await (await request(`/api/join/${joinToken}/accept`,{consent:true,workerType:'BROWSER',deviceIdentity:'phase9-rejected-browser'})).json() as any;
 assert.equal((await request(`/api/admin/enrollments/${rejected.enrollmentId}/approval`,{approved:false},cookie)).status,200);
 const [rejectedNodes]=await pool.query<any[]>('SELECT id FROM nodes WHERE enrollment_id=?',[rejected.enrollmentId]);assert.equal(rejectedNodes.length,0);
 const listing=await request(`/api/admin/networks/${network.id}/enrollments?page=2&pageSize=1`,undefined,cookie);assert.equal(listing.status,200);const page=await listing.json() as any;assert.equal(page.items.length,1);assert.equal(page.page,2);assert.equal(page.totalItems,3);assert.equal(page.totalPages,3);
 const replacementSlot=await request(`/api/join/${joinToken}/accept`,{consent:true,workerType:'ANDROID',deviceIdentity:'phase9-rejected-slot-reused'});assert.equal(replacementSlot.status,201,'rejection releases its capacity reservation');
 const rotate=await request(`/api/admin/networks/${network.id}/rotate-join-link`,{},cookie);assert.equal(rotate.status,200);assert.equal((await request(`/api/join/${joinToken}`)).status,404);
 const distribution=await request('/api/distribution');assert.equal(distribution.status,200);const manifest=await distribution.json() as any;assert.deepEqual(manifest.platforms.map((p:any)=>p.platform),['WINDOWS','ANDROID']);for(const entry of manifest.platforms)assert.equal(entry.available,false);
 const [audit]=await pool.query<any[]>("SELECT event_type FROM audit_events WHERE target_id=? AND event_type IN ('ENROLLMENT_APPROVED','ENROLLMENT_REJECTED')",[enrollment.enrollmentId]);assert.equal(audit.length,1);
 if(process.env.OMNICOMPILE_TEST_LOCAL_DISTRIBUTION==='1'){
  for(const item of manifest.platforms){assert.equal(item.localAvailable,true);assert.equal(item.channel,'LOCAL_PRERELEASE');assert.equal(item.available,false);assert.ok(!('filePath' in item));const download=await request(item.localDownloadUrl);assert.equal(download.status,200);const bytes=Buffer.from(await download.arrayBuffer());assert.equal(bytes.length,item.sizeBytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);assert.equal(download.headers.get('x-content-sha256'),item.sha256);}
  assert.equal((await request('/api/distribution/UNKNOWN/download')).status,404);
 }
 const throttled=[];for(let index=0;index<11;index++)throttled.push((await request('/api/distribution/UNKNOWN/download')).status);assert.ok(throttled.includes(429),'public package downloads must enforce a request budget');
 console.log('Phase9 isolated approval/decision race/rotation/distribution checks passed');
}finally{await pool.end();}
