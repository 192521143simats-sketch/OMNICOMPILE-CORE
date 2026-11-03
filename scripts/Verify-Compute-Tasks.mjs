import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {encodeProtocolMessage,parseCoordinatorMessage} from '@omnicompile/contracts';
import {assertIsolatedTarget,verifyIsolatedCoordinator} from './Integration-Target.mjs';
import {Store} from '../apps/coordinator/src/database.ts';
const target=assertIsolatedTarget();await verifyIsolatedCoordinator(target);
const origin=process.env.PUBLIC_BASE_URL;
async function request(path,body,cookie){const response=await fetch(target.base+path,{method:body?'POST':'GET',headers:{origin,...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
async function user(label){const email=`compute-${label}-${target.instance}@example.test`,password='Compute!Fixture123';assert.equal((await request('/api/auth/signup',{name:`Compute ${label}`,email,password,confirmPassword:password})).status,201);const login=await request('/api/auth/login',{identifier:email,password});assert.equal(login.status,200);return{cookie:login.cookie,id:login.body.user.id};}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll(work,done){for(let i=0;i<100;i++){const value=await work();if(done(value))return value;await pause(100);}throw new Error('Compute fixture timeout');}
const profile={workerType:'BROWSER',deviceType:'DESKTOP',cpuModel:'Logical compute fixture',logicalCores:2,totalMemoryBytes:4e9,operatingSystem:'Test',architecture:'browser',runtimes:{c:false,python:false,java:false},toolchains:{c:{available:false},python:{available:false},java:{available:false}},operations:{irOptimization:true,staticAnalysis:true,browserCompute:true,nativeCompilation:false}};
const resources=()=>({cpuUtilizationPercent:1,freeMemoryBytes:2e9,memoryUtilizationPercent:50,observedAt:new Date().toISOString()});
const store=await Store.connect({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),name:target.database,user:process.env.DB_USER,password:process.env.DB_PASSWORD});let socket,held=false,assignment;
try{
 const owner=await user('owner'),foreign=await user('foreign');
 assert.equal((await request('/api/compute/tasks')).status,401);
 assert.equal((await request('/api/compute/tasks',{payload:{operation:'prime_count',limit:20}},owner.cookie)).status,503);
 assert.equal((await request('/api/compute/tasks',{payload:{operation:'python_compile',source:'print(1)'}},owner.cookie)).status,400);
 const admin=await request('/api/auth/login',{identifier:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD});assert.equal(admin.status,200);
 const network=await request('/api/admin/networks',{name:'Compute API fixture',maxNodes:2},admin.cookie);assert.equal(network.status,201);
 const join=`/api${new URL(network.body.joinUrl).pathname}`;
 const enrollment=await request(join+'/accept',{consent:true,workerType:'BROWSER',deviceIdentity:'compute-api-logical-fixture'});assert.equal(enrollment.status,201);
 socket=new WebSocket(target.base.replace(/^http/,'ws')+'/ws/worker',{headers:{Cookie:enrollment.cookie,Origin:origin}});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Registration timeout')),5000);socket.on('error',reject);socket.on('open',()=>socket.send(encodeProtocolMessage({type:'register',profile})));socket.on('message',raw=>{const message=parseCoordinatorMessage(JSON.parse(raw.toString()));if(message.type==='registered'){socket.send(encodeProtocolMessage({type:'heartbeat',resources:resources()}));clearTimeout(timer);resolve();}if(message.type==='task_assignment'){assignment=message;socket.send(encodeProtocolMessage({type:'task_state',taskId:message.taskId,attempt:message.attempt,status:'RUNNING'}));if(!held)socket.send(encodeProtocolMessage({type:'task_result',taskId:message.taskId,attempt:message.attempt,result:{operation:'prime_count',limit:20,count:8},executionTimeMs:1,resources:resources()}));}});});
 await pause(100);
 assert.equal((await request('/api/compute/tasks',{payload:{operation:'matrix_multiply',left:[[1]],right:[[2]]}},owner.cookie)).status,503,'A worker without portableMatrix must not admit matrix tasks');
 const created=await request('/api/compute/tasks',{payload:{operation:'prime_count',limit:20}},owner.cookie);assert.equal(created.status,201);const id=created.body.id;
 const completed=await poll(()=>request(`/api/compute/tasks/${id}`,undefined,owner.cookie),r=>r.body.status==='COMPLETED');assert.equal(completed.body.result.result.count,8);assert.equal(completed.body.attempts[0].status,'COMPLETED');assert.ok(completed.body.deadlineAt);assert.equal('nodeId' in completed.body.attempts[0],false);
 assert.equal((await request(`/api/compute/tasks/${id}`,undefined,foreign.cookie)).status,404);assert.equal((await request(`/api/compute/tasks/${id}/cancel`,{},foreign.cookie)).status,404);
 assert.equal((await request('/api/compute/tasks',undefined,foreign.cookie)).body.totalItems,0);
 // Seed only this proven isolated database to cover true SQL history paging.
 for(let i=0;i<10;i++)await store.pool.execute("INSERT INTO tasks(id,session_id,network_id,user_id,kind,payload_json,required_capability,status,created_at) VALUES(?,NULL,?,?,'TEST_COMPUTE',?,'base','COMPLETED',?)",[`TASK-history-${target.instance}-${i}`,network.body.id,owner.id,JSON.stringify({operation:'prime_count',limit:20}),new Date().toISOString()]);
 const page1=await request('/api/compute/tasks?page=1',undefined,owner.cookie),page2=await request('/api/compute/tasks?page=2',undefined,owner.cookie);assert.equal(page1.body.items.length,10);assert.equal(page2.body.items.length,1);assert.equal(page1.body.totalItems,11);assert.equal(page1.body.pageSize,10);
 assert.equal((await request('/api/compute/tasks?pageSize=100',undefined,owner.cookie)).status,400);
 held=true;await pause(100);
 const racing=await Promise.all([request('/api/compute/tasks',{payload:{operation:'prime_count',limit:20}},owner.cookie),request('/api/compute/tasks',{payload:{operation:'prime_count',limit:20}},owner.cookie)]);assert.deepEqual(racing.map(r=>r.status).sort(),[201,409]);const activeId=racing.find(r=>r.status===201).body.id;
 await poll(()=>Promise.resolve(assignment),r=>r?.taskId===activeId);
 assert.equal((await request(`/api/compute/tasks/${activeId}/cancel`,{},owner.cookie)).status,200);assert.equal((await request(`/api/compute/tasks/${activeId}`,undefined,owner.cookie)).body.status,'CANCELLED');
 const [audit]=await store.pool.execute("SELECT actor_type FROM audit_events WHERE target_id=? AND event_type='TASK_CANCELLED'",[activeId]);assert.equal(audit[0].actor_type,'USER','Owner cancellation audit must identify the user role');
 const [legacy]=await store.pool.execute('SELECT user_id FROM tasks WHERE id=?',[id]);assert.equal(legacy[0].user_id,owner.id);
 console.log(JSON.stringify({computeApi:'passed',ownerIsolation:'passed',pagination:'10 per page',concurrentAdmission:'one active task',capabilitySelection:'passed',results:'independently verified',cancellation:'passed',client:'logical test fixture, not physical browser'}));
}finally{socket?.terminate();await store.close();}
