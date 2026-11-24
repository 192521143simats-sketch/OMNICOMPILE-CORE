import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import WebSocket from 'ws';
import {encodeProtocolMessage,parseCoordinatorMessage} from '@omnicompile/contracts';

import {Store} from '../apps/coordinator/src/database.ts';
import {assertIsolatedTarget,verifyIsolatedCoordinator} from './Integration-Target.mjs';

const target=assertIsolatedTarget();await verifyIsolatedCoordinator(target);
const store=await Store.connect({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),name:target.database,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
const agents=[],seen=new Map();let fatal;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(path,body,cookie){const response=await fetch(target.base+path,{method:body?'POST':'GET',signal:AbortSignal.timeout(15000),headers:{origin:process.env.PUBLIC_BASE_URL,...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
async function poll(read,done){const deadline=Date.now()+240000;while(Date.now()<deadline){if(fatal)throw fatal;const result=await read();if(done(result))return result;await pause(250);}throw new Error('Distributed Python case timed out');}
const profile={workerType:'BROWSER',deviceType:'DESKTOP',cpuModel:'Logical protocol integration fixture, not physical browser evidence',logicalCores:2,totalMemoryBytes:4e9,operatingSystem:'Protocol fixture',architecture:'browser',runtimes:{c:false,python:false,java:false},toolchains:{c:{available:false},python:{available:false},java:{available:false}},operations:{irOptimization:true,staticAnalysis:true,browserCompute:true,nativeCompilation:false,serverAssistedCompilation:true}};
const resources=()=>({cpuUtilizationPercent:0,cpuMeasurementAvailable:false,freeMemoryBytes:2e9,memoryUtilizationPercent:0,memoryMeasurementAvailable:false,observedAt:new Date().toISOString()});
try{
 const admin=await request('/api/auth/login',{identifier:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD});assert.equal(admin.status,200);
 const network=await request('/api/admin/networks',{name:'Java invoice dependency case',maxNodes:2,requireAdminApproval:false},admin.cookie);assert.equal(network.status,201);
 for(let index=0;index<2;index++){
  const enrollment=await request(`/api${new URL(network.body.joinUrl).pathname}/accept`,{consent:true,workerType:'BROWSER',deviceIdentity:`case-study-${target.instance}-${index}`});assert.equal(enrollment.status,201);
  const agent={cookie:enrollment.cookie,socket:new WebSocket(target.base.replace(/^http/,'ws')+'/ws/worker',{headers:{Cookie:enrollment.cookie,Origin:process.env.PUBLIC_BASE_URL}}),nodeId:null,timer:null};agents.push(agent);
  agent.socket.on('open',()=>agent.socket.send(encodeProtocolMessage({type:'register',profile})));
  agent.socket.on('error',error=>{fatal=error;});
  agent.socket.on('message',raw=>{void(async()=>{
   const message=parseCoordinatorMessage(JSON.parse(raw.toString()));
   if(message.type==='registered'){
    agent.nodeId=message.nodeId;
    const beat=()=>{if(agent.socket.readyState===WebSocket.OPEN)agent.socket.send(encodeProtocolMessage({type:'heartbeat',resources:resources()}));};beat();agent.timer=setInterval(beat,1000);
   }else if(message.type==='task_assignment'){
    assert.equal(message.payload.operation,'java_compile');seen.set(message.taskId,{nodeId:agent.nodeId,source:message.payload.source});
    agent.socket.send(encodeProtocolMessage({type:'task_state',taskId:message.taskId,attempt:message.attempt,status:'RUNNING'}));
    const response=await request('/api/worker/compiler',{taskId:message.taskId,attempt:message.attempt},agent.cookie);assert.equal(response.status,200,JSON.stringify(response.body));const result={result:response.body.result,executionTimeMs:response.body.executionTimeMs};await pause(200);
    agent.socket.send(encodeProtocolMessage({type:'task_result',taskId:message.taskId,attempt:message.attempt,...result,resources:resources()}));
   }
  })().catch(error=>{fatal=error;});});
 }
 await poll(async()=>{const [rows]=await store.pool.execute("SELECT id FROM nodes WHERE network_id=? AND status='AVAILABLE'",[network.body.id]);return rows;},rows=>rows.length===2);
 const email=`case-study-${target.instance}@example.test`,password='CaseStudyOnly!42';assert.equal((await request('/api/auth/signup',{name:'Case study',email,password,confirmPassword:password})).status,201);
 const user=await request('/api/auth/login',{identifier:email,password});assert.equal(user.status,200);
 const source='public class Invoice { static int subtotal(int x){return x*(2+3);} static int invoice(int x){return subtotal(x)+1;} public static void main(String[] args){System.out.println(invoice(4));} }';
 const submitted=await request('/api/compilations',{language:'java',sourceName:'Invoice.java',source},user.cookie);assert.equal(submitted.status,202,JSON.stringify(submitted.body));
 const job=await poll(()=>request(`/api/compilations/${submitted.body.id}`,undefined,user.cookie),result=>['COMPLETED','FAILED'].includes(result.body.status));assert.equal(job.body.status,'COMPLETED',job.body.error);
 assert.equal(seen.size,3);assert.equal(new Set([...seen.values()].map(row=>row.nodeId)).size,2,'real lexical units must reach both eligible devices');
 const [attempts]=await store.pool.execute('SELECT DISTINCT n.network_id networkId FROM task_attempts a JOIN tasks t ON t.id=a.task_id JOIN nodes n ON n.id=a.node_id WHERE t.job_id=?',[job.body.id]);assert.deepEqual(attempts.map(row=>row.networkId),[network.body.id]);
 assert.equal(job.body.metrics.partitioning.assemblyMatched,true);assert.equal(job.body.metrics.report.measurements.tasks.successful,3);assert.equal(job.body.metrics.report.measurements.tasks.successRate,100);assert.equal(job.body.metrics.execution.stdout.trim(),'21');
 assert.deepEqual(job.body.workerPlatforms,['Web']);assert.ok(job.body.artifacts.some(row=>row.artifactType==='JAR'));
 console.log('Three real Java method units compiled across two authenticated Web identities using server tools; verified linking preserved method dependencies and output 21. Not physical-device acceptance.');
}finally{
 for(const agent of agents){if(agent.timer)clearInterval(agent.timer);agent.socket.close();}
 await store.pool.end();
}
