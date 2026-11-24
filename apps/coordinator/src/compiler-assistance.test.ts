import {afterEach,expect,it,vi} from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {registerCompilerAssistance} from './compiler-assistance.js';
const original=process.env.OMNICOMPILE_EXECUTOR_URL;
afterEach(()=>{if(original===undefined)delete process.env.OMNICOMPILE_EXECUTOR_URL;else process.env.OMNICOMPILE_EXECUTOR_URL=original;});
async function fixture(owns=true){
 process.env.OMNICOMPILE_EXECUTOR_URL='http://127.0.0.1:1';
 const queries:any[]=[],compile=vi.fn(async(_job:unknown,_signal:AbortSignal)=>({result:{operation:'python_compile',artifactBase64:'fixture'},executionTimeMs:1}));
 const app=Fastify();await app.register(cookie);
 const service=registerCompilerAssistance(app,{cookieName:'worker',connected:()=>true,
  networks:{authenticateCredential:async(token:string)=>token==='valid'?{nodeId:'NODE-A001',networkId:'NETWORK-A',approvalStatus:'APPROVED'}:null} as any,
  store:{setTaskRunning:vi.fn(async()=>true),pool:{execute:async(sql:string,params:unknown[])=>{queries.push({sql,params});return [sql.startsWith('SELECT')&&owns?[{jobId:'JOB-1',remainingMs:20000,payload:{operation:'python_compile',source:'print(42)',sourceName:'main.py'}}]:[]];}}} as any,
  compile:compile as any});
 return {app,compile,queries,service,setOwns:(value:boolean)=>{owns=value;}};
}
it('requires device authentication, a current assigned lease, and no arbitrary compiler input',async()=>{
 const f=await fixture(false);
 try{
  expect((await f.app.inject({method:'POST',url:'/api/worker/compiler',payload:{taskId:'TASK-1',attempt:1}})).statusCode).toBe(401);
  expect((await f.app.inject({method:'POST',url:'/api/worker/compiler',headers:{authorization:'Bearer valid'},payload:{taskId:'TASK-other',attempt:1}})).statusCode).toBe(409);
  expect((await f.app.inject({method:'POST',url:'/api/worker/compiler',headers:{authorization:'Bearer valid'},payload:{taskId:'TASK-1',attempt:1,source:'arbitrary'}})).statusCode).toBe(400);
  expect(f.compile).not.toHaveBeenCalled();
 }finally{await f.app.close();}
});
it('executes server-stored input, preserves the device attribution, and records assistance itself',async()=>{
 const f=await fixture();
 try{
  const response=await f.app.inject({method:'POST',url:'/api/worker/compiler',headers:{authorization:'Bearer valid'},payload:{taskId:'TASK-1',attempt:1}});
  expect(response.statusCode).toBe(200);expect(response.json().assistance).toMatchObject({method:'server-assisted compilation',workerNodeId:'NODE-A001'});
  const receipt=response.json().result;expect(receipt.operation).toBe('server_compiler_result');expect(JSON.stringify(response.json())).not.toContain('artifactBase64');
  expect(f.service.resolveResult('NODE-A001','TASK-1',1,receipt,999999).result).toMatchObject({operation:'python_compile'});
  expect(f.service.resolveResult('NODE-A001','TASK-1',1,receipt,999999).executionTimeMs).toBeLessThan(999999);
  expect(()=>f.service.resolveResult('NODE-other','TASK-1',1,receipt,1)).toThrow('another device');
  expect(()=>f.service.resolveResult('NODE-A001','TASK-1',2,receipt,1)).toThrow('another device');
  expect(f.compile).toHaveBeenCalledWith({kind:'task',language:'python',payload:{operation:'python_compile',source:'print(42)',sourceName:'main.py'}},expect.any(AbortSignal));
  expect(f.queries.find(item=>item.sql.startsWith('UPDATE compilation_jobs'))?.params[0]).toContain('NODE-A001');
 }finally{await f.app.close();}
});

it('aborts the actual tool transport when the assigned lease is withdrawn',async()=>{
 const f=await fixture();let stopped=false;
 f.compile.mockImplementation(async(_job,signal)=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>{stopped=true;reject(new Error('Tool request cancelled'));},{once:true});}));
 try{
  const pending=f.app.inject({method:'POST',url:'/api/worker/compiler',headers:{authorization:'Bearer valid'},payload:{taskId:'TASK-1',attempt:1}});
  await expect.poll(()=>f.compile.mock.calls.length).toBe(1);f.setOwns(false);
  expect((await pending).statusCode).toBe(409);expect(stopped).toBe(true);
  expect(f.queries.filter(item=>item.sql.startsWith('UPDATE compilation_jobs')).every(item=>!String(item.params[0]).includes('COMPLETED'))).toBe(true);
 }finally{await f.app.close();}
});
