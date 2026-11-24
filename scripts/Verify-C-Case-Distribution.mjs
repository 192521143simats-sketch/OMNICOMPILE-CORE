import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import WebSocket from 'ws';
import {encodeProtocolMessage,parseCoordinatorMessage} from '@omnicompile/contracts';
import {execute} from '../apps/worker/src/executor.ts';
import {Store} from '../apps/coordinator/src/database.ts';
import {assertIsolatedTarget,verifyIsolatedCoordinator} from './Integration-Target.mjs';

const target=assertIsolatedTarget();await verifyIsolatedCoordinator(target);
const store=await Store.connect({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),name:target.database,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
const agents=[],seen=new Map();let fatal;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(path,body,cookie){const response=await fetch(target.base+path,{method:body?'POST':'GET',signal:AbortSignal.timeout(15000),headers:{origin:process.env.PUBLIC_BASE_URL,...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
async function poll(read,done){const deadline=Date.now()+120000;while(Date.now()<deadline){if(fatal)throw fatal;const result=await read();if(done(result))return result;await pause(250);}throw new Error('Distributed C case timed out');}
const profile={workerType:'BROWSER',deviceType:'DESKTOP',cpuModel:'Logical protocol integration fixture, not physical browser evidence',logicalCores:2,totalMemoryBytes:4e9,operatingSystem:'Protocol fixture',architecture:'browser',runtimes:{c:false,python:false,java:false},toolchains:{c:{available:false},python:{available:false},java:{available:false}},operations:{irOptimization:true,staticAnalysis:true,browserCompute:true,nativeCompilation:false}};
const resources=()=>({cpuUtilizationPercent:0,cpuMeasurementAvailable:false,freeMemoryBytes:2e9,memoryUtilizationPercent:0,memoryMeasurementAvailable:false,observedAt:new Date().toISOString()});
try{
 const admin=await request('/api/auth/login',{identifier:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD});assert.equal(admin.status,200);
 const network=await request('/api/admin/networks',{name:'Manufacturing dependency case',maxNodes:2,requireAdminApproval:false},admin.cookie);assert.equal(network.status,201);
 for(let index=0;index<2;index++){
  const enrollment=await request(`/api${new URL(network.body.joinUrl).pathname}/accept`,{consent:true,workerType:'BROWSER',deviceIdentity:`case-study-${target.instance}-${index}`});assert.equal(enrollment.status,201);
  const agent={socket:new WebSocket(target.base.replace(/^http/,'ws')+'/ws/worker',{headers:{Cookie:enrollment.cookie,Origin:process.env.PUBLIC_BASE_URL}}),nodeId:null,timer:null};agents.push(agent);
  agent.socket.on('open',()=>agent.socket.send(encodeProtocolMessage({type:'register',profile})));
  agent.socket.on('error',error=>{fatal=error;});
  agent.socket.on('message',raw=>{void(async()=>{
   const message=parseCoordinatorMessage(JSON.parse(raw.toString()));
   if(message.type==='registered'){
    agent.nodeId=message.nodeId;
    const beat=()=>{if(agent.socket.readyState===WebSocket.OPEN)agent.socket.send(encodeProtocolMessage({type:'heartbeat',resources:resources()}));};beat();agent.timer=setInterval(beat,1000);
   }else if(message.type==='task_assignment'){
    assert.equal(message.payload.operation,'c_optimize_ir');seen.set(message.taskId,{nodeId:agent.nodeId,functionName:message.payload.function.name});
    agent.socket.send(encodeProtocolMessage({type:'task_state',taskId:message.taskId,attempt:message.attempt,status:'RUNNING'}));
    const result=await execute(message.payload);await pause(200);
    agent.socket.send(encodeProtocolMessage({type:'task_result',taskId:message.taskId,attempt:message.attempt,...result,resources:resources()}));
   }
  })().catch(error=>{fatal=error;});});
 }
 await poll(async()=>{const [rows]=await store.pool.execute("SELECT id FROM nodes WHERE network_id=? AND status='AVAILABLE'",[network.body.id]);return rows;},rows=>rows.length===2);
 const email=`case-study-${target.instance}@example.test`,password='CaseStudyOnly!42';assert.equal((await request('/api/auth/signup',{name:'Case study',email,password,confirmPassword:password})).status,201);
 const user=await request('/api/auth/login',{identifier:email,password});assert.equal(user.status,200);
 const source=await readFile('samples/case-studies/c/manufacturing_ir.c','utf8');
 const submitted=await request('/api/compilations',{language:'c',sourceName:'manufacturing_ir.c',source},user.cookie);assert.equal(submitted.status,202,JSON.stringify(submitted.body));
 const job=await poll(()=>request(`/api/compilations/${submitted.body.id}`,undefined,user.cookie),result=>['COMPLETED','FAILED'].includes(result.body.status));assert.equal(job.body.status,'COMPLETED',job.body.error);
 assert.equal(seen.size,5);assert.equal(new Set([...seen.values()].map(row=>row.nodeId)).size,2,'five real function units must reach both eligible workers');
 assert.deepEqual([...seen.values()].map(row=>row.functionName).sort(),['material','labor','overhead','quote','main'].sort());
 const [attempts]=await store.pool.execute('SELECT DISTINCT n.network_id networkId FROM task_attempts a JOIN tasks t ON t.id=a.task_id JOIN nodes n ON n.id=a.node_id JOIN optimization_batch_tasks b ON b.task_id=t.id WHERE b.batch_id=?',[job.body.batchId]);assert.deepEqual(attempts.map(row=>row.networkId),[network.body.id]);
 assert.deepEqual(job.body.workerPlatforms,['Web']);assert.ok(job.body.artifacts.some(row=>row.artifactType==='EXECUTABLE'));
 console.log('Five actual C IR function units executed across two authenticated protocol workers in one network; dependencies preserved through verified aggregation. This is not physical-device acceptance.');
}finally{
 for(const agent of agents){if(agent.timer)clearInterval(agent.timer);agent.socket.close();}
 await store.pool.end();
}
