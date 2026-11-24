import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {encodeProtocolMessage,parseCoordinatorMessage} from '@omnicompile/contracts';
import {Store} from '../apps/coordinator/src/database.ts';
import {assertIsolatedTarget,verifyIsolatedCoordinator} from './Integration-Target.mjs';
const target=assertIsolatedTarget();await verifyIsolatedCoordinator(target);
const store=await Store.connect({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),name:target.database,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
let socket,timer,fatal;const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(path,body,headers={}){const response=await fetch(target.base+path,{method:body?'POST':'GET',signal:AbortSignal.timeout(35000),headers:{origin:process.env.PUBLIC_BASE_URL,...headers,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,value:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
async function poll(work,done){const end=Date.now()+120000;while(Date.now()<end){if(fatal)throw fatal;const value=await work();if(done(value))return value;await pause(250);}throw new Error('Assisted compilation timed out');}
const resources=()=>({cpuUtilizationPercent:0,cpuMeasurementAvailable:false,freeMemoryBytes:0,memoryUtilizationPercent:0,memoryMeasurementAvailable:false,observedAt:new Date().toISOString(),batteryPercent:100,isCharging:true,networkType:'WIFI',thermalState:'NORMAL',lifecycleState:'FOREGROUND'});
try{
 const admin=await request('/api/auth/login',{identifier:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD});assert.equal(admin.status,200);
 const email=`assisted-${target.instance}@example.test`,password='AssistedFixtureOnly!42';assert.equal((await request('/api/auth/signup',{name:'Assistance fixture',email,password,confirmPassword:password})).status,201);
 const user=await request('/api/auth/login',{identifier:email,password});assert.equal(user.status,200);
 for(const [workerType,platform] of [['BROWSER','WEB'],['NATIVE','WINDOWS'],['ANDROID','ANDROID']]){
  const network=await request('/api/admin/networks',{name:`${platform} compiler tools fixture`,maxNodes:1,requireAdminApproval:false},{cookie:admin.cookie});assert.equal(network.status,201);
  const enrollment=await request(`/api${new URL(network.value.joinUrl).pathname}/accept`,{consent:true,workerType,deviceIdentity:`assisted-${target.instance}-${platform}`});assert.equal(enrollment.status,201);
  const headers=enrollment.value.workerCredential?{authorization:`Bearer ${enrollment.value.workerCredential}`}:{cookie:enrollment.cookie};
  let nodeId;
  const profile={workerType,deviceType:'DESKTOP',cpuModel:'Logical protocol fixture with native toolchains disabled; not physical-device evidence',logicalCores:2,totalMemoryBytes:0,operatingSystem:platform==='WINDOWS'?'Windows protocol fixture':platform,architecture:'fixture',runtimes:{c:false,python:false,java:false},toolchains:{c:{available:false},python:{available:false},java:{available:false}},operations:{irOptimization:true,staticAnalysis:false,browserCompute:true,nativeCompilation:false,serverAssistedCompilation:true,taskCancellation:true}};
  // Android has measurable memory and therefore advertises an actual bounded fixture value.
  if(workerType!=='BROWSER')profile.totalMemoryBytes=1024**3;
  const snapshot=()=>workerType==='BROWSER'?resources():{...resources(),memoryMeasurementAvailable:true,freeMemoryBytes:512*1024*1024};
  socket=new WebSocket(target.base.replace(/^http/,'ws')+'/ws/worker',{headers:{...headers,Origin:process.env.PUBLIC_BASE_URL}});
  socket.on('error',error=>{fatal=error;});socket.on('open',()=>socket.send(encodeProtocolMessage({type:'register',profile})));
  socket.on('message',raw=>{void(async()=>{const message=parseCoordinatorMessage(JSON.parse(raw.toString()));
   if(message.type==='registered'){nodeId=message.nodeId;const beat=()=>{if(socket.readyState===WebSocket.OPEN)socket.send(encodeProtocolMessage({type:'heartbeat',resources:snapshot()}));};beat();timer=setInterval(beat,1000);}
   else if(message.type==='error')throw new Error(message.code+': '+message.message);
   else if(message.type==='task_assignment'){
    socket.send(encodeProtocolMessage({type:'task_state',taskId:message.taskId,attempt:message.attempt,status:'RUNNING'}));
    const result=await request('/api/worker/compiler',{taskId:message.taskId,attempt:message.attempt},headers);
    if(result.status===200){assert.equal(result.value.assistance.workerNodeId,nodeId);socket.send(encodeProtocolMessage({type:'task_result',taskId:message.taskId,attempt:message.attempt,result:result.value.result,executionTimeMs:result.value.executionTimeMs,resources:snapshot()}));}
    else socket.send(encodeProtocolMessage({type:'task_state',taskId:message.taskId,attempt:message.attempt,status:'FAILED',error:result.value.error.message,...(result.value.error.diagnostics?{diagnostics:result.value.error.diagnostics}:{})}));
   }
  })().catch(error=>{fatal=error;});});
  await poll(async()=>{const [rows]=await store.pool.execute("SELECT id FROM nodes WHERE network_id=? AND status='AVAILABLE'",[network.value.id]);return rows;},rows=>rows.length===1);
  assert.equal((await request('/api/worker/compiler',{taskId:'TASK-not-owned',attempt:1},headers)).status,409,'unassigned tool access must fail');
  for(const item of [
   {language:'c',sourceName:'invoice.c',source:'#include <stdio.h>\nint main(void){printf("42\\n");return 0;}'},
   {language:'python',sourceName:'invoice.py',source:'print(20+22)'},
   {language:'java',sourceName:'Invoice.java',source:'public class Invoice {public static void main(String[] a){System.out.println(20+22);}}'}
  ]){
   const submitted=await request('/api/compilations',item,{cookie:user.cookie});assert.equal(submitted.status,202,JSON.stringify(submitted.value));
   const result=await poll(()=>request(`/api/compilations/${submitted.value.id}`,undefined,{cookie:user.cookie}),value=>['COMPLETED','FAILED'].includes(value.value.status));
   assert.equal(result.value.status,'COMPLETED',result.value.error);assert.equal(result.value.networkId,network.value.id);
   assert.equal(result.value.metrics.compilationAssistance.method,'server-assisted compilation');assert.equal(result.value.metrics.compilationAssistance.workerNodeId,nodeId);
   assert.equal(result.value.metrics.report.programExecution.status,'SUCCEEDED');assert.equal(result.value.metrics.report.programExecution.output,'42\n');
   assert.equal(result.value.metrics.report.measurements.compilationMethod,'server-assisted compilation');
   const metrics=await request(`/api/user/compiler-metrics?jobId=${result.value.id}`,undefined,{cookie:user.cookie});assert.equal(metrics.value.jobResult.successRate,100);assert.equal(metrics.value.availability.registered,1);assert.equal(metrics.value.availability.platforms.find(row=>row.platform===platform).registered,1);
   console.log(`${platform} ${item.language}: real server tool compilation and isolated execution passed; only ${nodeId} counted as worker.`);
  }
  if(platform==='WEB')for(const item of [
   {sourceName:'runtime_failure.py',source:'raise ValueError("invoice mismatch")',terminal:'COMPLETED',execution:'FAILED'},
   {sourceName:'syntax_failure.py',source:'def broken(:',terminal:'FAILED'}
  ]){
   const submitted=await request('/api/compilations',{language:'python',sourceName:item.sourceName,source:item.source},{cookie:user.cookie});assert.equal(submitted.status,202);
   const result=await poll(()=>request(`/api/compilations/${submitted.value.id}`,undefined,{cookie:user.cookie}),value=>['COMPLETED','FAILED'].includes(value.value.status)&&value.value.artifacts.length>0);
   assert.equal(result.value.status,item.terminal);assert.equal(result.value.metrics.compilationAssistance.method,'server-assisted compilation');
   assert.equal(result.value.metrics.report.measurements.compilationMethod,'server-assisted compilation');
   if(item.execution)assert.equal(result.value.metrics.report.programExecution.status,item.execution);else assert.ok(result.value.metrics.report.errors.some(error=>error.line>0));
   const metrics=await request(`/api/user/compiler-metrics?jobId=${result.value.id}`,undefined,{cookie:user.cookie});assert.equal(metrics.value.jobResult.successRate,0);
  }
  clearInterval(timer);timer=null;socket.close();await poll(async()=>{const [[row]]=await store.pool.execute('SELECT status FROM nodes WHERE id=?',[nodeId]);return row.status;},status=>status==='OFFLINE');
 }
}finally{if(timer)clearInterval(timer);socket?.close();await store.pool.end();}
