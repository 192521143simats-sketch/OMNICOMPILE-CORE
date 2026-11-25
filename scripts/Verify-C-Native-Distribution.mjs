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
async function request(path,body,cookie,extra={}){const response=await fetch(target.base+path,{method:body?'POST':'GET',signal:AbortSignal.timeout(path==='/api/worker/compiler'?35000:15000),headers:{origin:process.env.PUBLIC_BASE_URL,...(cookie?{cookie}:{}),...extra,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
async function poll(read,done){const deadline=Date.now()+240000;while(Date.now()<deadline){if(fatal)throw fatal;const result=await read();if(done(result))return result;await pause(250);}throw new Error('Distributed Python case timed out');}
const profile={workerType:'BROWSER',deviceType:'DESKTOP',cpuModel:'Logical protocol integration fixture, not physical browser evidence',logicalCores:2,totalMemoryBytes:4e9,operatingSystem:'Protocol fixture',architecture:'browser',runtimes:{c:false,python:false,java:false},toolchains:{c:{available:false},python:{available:false},java:{available:false}},operations:{irOptimization:true,staticAnalysis:true,browserCompute:true,nativeCompilation:false,serverAssistedCompilation:true}};
const resources=()=>({cpuUtilizationPercent:0,cpuMeasurementAvailable:false,freeMemoryBytes:2e9,memoryUtilizationPercent:0,memoryMeasurementAvailable:false,observedAt:new Date().toISOString()});
try{
 const admin=await request('/api/auth/login',{identifier:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD});assert.equal(admin.status,200);
 const network=await request('/api/admin/networks',{name:'C factory dependency case',maxNodes:3,requireAdminApproval:false},admin.cookie);assert.equal(network.status,201);
 for(let index=0;index<3;index++){
  const enrollment=await request(`/api${new URL(network.body.joinUrl).pathname}/accept`,{consent:true,workerType:['BROWSER','NATIVE','ANDROID'][index],deviceIdentity:`case-study-${target.instance}-${index}`});assert.equal(enrollment.status,201);
  const headers=enrollment.body.workerCredential?{authorization:`Bearer ${enrollment.body.workerCredential}`}:{Cookie:enrollment.cookie};
  const ownProfile={...profile,workerType:['BROWSER','NATIVE','ANDROID'][index],operatingSystem:['Protocol fixture','Windows protocol fixture','Android protocol fixture'][index],contributionPolicy:index===0?{enabled:true}:{enabled:true,maxMemoryBytes:16*1024*1024,maxTaskDurationMs:30000}};
  const agent={headers,cookie:enrollment.cookie,socket:new WebSocket(target.base.replace(/^http/,'ws')+'/ws/worker',{headers:{...headers,Origin:process.env.PUBLIC_BASE_URL}}),nodeId:null,timer:null};agents.push(agent);
  agent.socket.on('open',()=>agent.socket.send(encodeProtocolMessage({type:'register',profile:ownProfile})));
  agent.socket.on('error',error=>{fatal=error;});
  agent.socket.on('message',raw=>{void(async()=>{
   const message=parseCoordinatorMessage(JSON.parse(raw.toString()));
   if(message.type==='registered'){
    agent.nodeId=message.nodeId;
    const beat=()=>{if(agent.socket.readyState===WebSocket.OPEN)agent.socket.send(encodeProtocolMessage({type:'heartbeat',resources:{...resources(),memoryMeasurementAvailable:index!==0,batteryPercent:80,networkType:'WIFI',thermalState:'NORMAL',lifecycleState:'FOREGROUND'}}));};beat();agent.timer=setInterval(beat,1000);
   }else if(message.type==='task_assignment'){
    assert.equal(message.payload.operation,'c_compile');seen.set(message.taskId,{nodeId:agent.nodeId,source:message.payload.source});
    agent.socket.send(encodeProtocolMessage({type:'task_state',taskId:message.taskId,attempt:message.attempt,status:'RUNNING'}));
    const response=await request('/api/worker/compiler',{taskId:message.taskId,attempt:message.attempt},agent.cookie,agent.headers);assert.equal(response.status,200,JSON.stringify(response.body));const result={result:response.body.result,executionTimeMs:response.body.executionTimeMs};await pause(200);
    agent.socket.send(encodeProtocolMessage({type:'task_result',taskId:message.taskId,attempt:message.attempt,...result,resources:{...resources(),memoryMeasurementAvailable:index!==0,batteryPercent:80,networkType:'WIFI',thermalState:'NORMAL',lifecycleState:'FOREGROUND'}}));
   }
  })().catch(error=>{fatal=error;});});
 }
 await poll(async()=>{const [rows]=await store.pool.execute("SELECT id FROM nodes WHERE network_id=? AND status='AVAILABLE'",[network.body.id]);return rows;},rows=>rows.length===3);
 const email=`case-study-${target.instance}@example.test`,password='CaseStudyOnly!42';assert.equal((await request('/api/auth/signup',{name:'Case study',email,password,confirmPassword:password})).status,201);
 const user=await request('/api/auth/login',{identifier:email,password});assert.equal(user.status,200);
 const source=await readFile('samples/case-studies/c/factory_quality.c','utf8');
 const submitted=await request('/api/compilations',{language:'c',sourceName:'factory_quality.c',source},user.cookie);assert.equal(submitted.status,202,JSON.stringify(submitted.body));
 const job=await poll(()=>request(`/api/compilations/${submitted.body.id}`,undefined,user.cookie),result=>['COMPLETED','FAILED'].includes(result.body.status));assert.equal(job.body.status,'COMPLETED',job.body.error);
 assert.equal(seen.size,4);assert.equal(new Set([...seen.values()].map(row=>row.nodeId)).size,3,'real lexical units must reach all three eligible devices');
 const [attempts]=await store.pool.execute('SELECT DISTINCT n.network_id networkId FROM task_attempts a JOIN tasks t ON t.id=a.task_id JOIN nodes n ON n.id=a.node_id WHERE t.job_id=?',[job.body.id]);assert.deepEqual(attempts.map(row=>row.networkId),[network.body.id]);
 assert.equal(job.body.metrics.partitioning.assemblyMatched,true);assert.equal(job.body.metrics.report.measurements.tasks.successful,4);assert.equal(job.body.metrics.report.measurements.tasks.successRate,100);assert.equal(job.body.metrics.execution.stdout.trim(),'rejects=2 energy=1204');
 assert.deepEqual(job.body.workerPlatforms.sort(),['Android','Web','Windows']);assert.ok(job.body.artifacts.some(row=>row.artifactType==='EXECUTABLE'));
 const measured=await request(`/api/user/compiler-metrics?jobId=${job.body.id}`,undefined,user.cookie);
 for(const platform of ['WEB','WINDOWS','ANDROID'])assert.equal(measured.body.availability.platforms.find(row=>row.platform===platform).available,1,'All three eligible devices must be counted as available after completion');
 console.log('Four real C function-context units compiled across three authenticated Web/Windows/Android identities with a 16 MiB Android policy using server tools; GCC verification preserved array/pointer/function dependencies and factory results. Not physical-device acceptance.');
}finally{
 for(const agent of agents){if(agent.timer)clearInterval(agent.timer);agent.socket.close();}
 await store.pool.end();
}
