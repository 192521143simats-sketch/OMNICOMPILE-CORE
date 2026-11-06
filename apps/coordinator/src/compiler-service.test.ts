import {describe,it,expect} from 'vitest';
import {createCompilerService} from './compiler-service.js';
import {runCompilerProcess} from './compiler-process-control.js';
import {verifyCompilation} from './compilation-verification.js';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

describe('internal language compiler service',()=>{
  it('requires a scoped token and refuses another language before execution',async()=>{
    let executions=0;
    const app=createCompilerService('python','a'.repeat(64),async()=>{executions++;return {ok:true};});
    const payload={action:'verify',source:{language:'python',sourceName:'main.py',sourceText:'print(1)'},worker:{operation:'python_compile'}};
    expect((await app.inject({method:'POST',url:'/compile',payload})).statusCode).toBe(401);
    expect((await app.inject({method:'POST',url:'/compile',headers:{authorization:'Bearer '+'a'.repeat(64)},payload:{...payload,source:{...payload.source,language:'java'}}})).statusCode).toBe(422);
    expect(executions).toBe(0);
    expect((await app.inject({method:'POST',url:'/compile',headers:{authorization:'Bearer '+'a'.repeat(64)},payload})).statusCode).toBe(200);
    expect(executions).toBe(1);
    await app.close();
  });
  it('rejects traversal and excess concurrent requests',async()=>{
    let finish:(value:unknown)=>void=()=>{};
    const app=createCompilerService('c','b'.repeat(64),()=>new Promise(resolve=>{finish=resolve;}));
    const headers={authorization:'Bearer '+'b'.repeat(64)};
    const payload={action:'verify',source:{language:'c',sourceName:'../main.c',sourceText:'int main(){return 0;}'},worker:{operation:'c_compile'}};
    expect((await app.inject({method:'POST',url:'/compile',headers,payload})).statusCode).toBe(400);
    payload.source.sourceName='main.c';
    const first=app.inject({method:'POST',url:'/compile',headers,payload});
    await new Promise(resolve=>setTimeout(resolve,30));
    expect((await app.inject({method:'POST',url:'/compile',headers,payload})).statusCode).toBe(429);
    finish({});await first;await app.close();
  });
  it('routes coordinator verification over authenticated HTTP and preserves compiler diagnostics',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'omnicompile-router-'));
    const secret=join(directory,'secret');
    await writeFile(secret,'c'.repeat(64),{mode:0o600});
    const app=createCompilerService('python','c'.repeat(64),async(payload)=>{
      await new Promise(resolve=>setTimeout(resolve,25));
      const input=payload as {source:{sourceText:string}};
      if(input.source.sourceText==='bad')throw Object.assign(new Error('Invalid Python syntax'),{diagnostics:[{severity:'error',line:1,message:'Invalid syntax'}]});
      return {operation:'python_compile',generatedSource:input.source.sourceText};
    });
    const oldUrl=process.env.OMNICOMPILE_PYTHON_COMPILER_URL;
    const oldFile=process.env.OMNICOMPILE_COMPILER_TOKEN_FILE;
    try{
      process.env.OMNICOMPILE_PYTHON_COMPILER_URL=await app.listen({host:'127.0.0.1',port:0});
      process.env.OMNICOMPILE_COMPILER_TOKEN_FILE=secret;
      const payload={action:'verify',source:{language:'python',sourceName:'main.py',sourceText:'print(1)'},worker:{operation:'python_compile'}};
      expect(await runCompilerProcess(payload,new AbortController().signal)).toEqual({operation:'python_compile',generatedSource:'print(1)'});
      const storedSource={...payload.source,language:'python' as const,createdAt:new Date().toISOString()};
      expect(await verifyCompilation(storedSource,payload.worker)).toEqual({operation:'python_compile',generatedSource:'print(1)'});
      // A valid verification should wait through the service's bounded admission limit.
      const first=runCompilerProcess(payload,new AbortController().signal);
      const second=runCompilerProcess(payload,new AbortController().signal);
      const concurrent=await Promise.allSettled([first,second]);
      expect(concurrent.map(result=>result.status)).toEqual(['fulfilled','fulfilled']);
      payload.source.sourceText='bad';
      await expect(runCompilerProcess(payload,new AbortController().signal)).rejects.toMatchObject({message:'Invalid Python syntax',diagnostics:[{severity:'error',line:1,message:'Invalid syntax'}]});
    }finally{
      if(oldUrl===undefined)delete process.env.OMNICOMPILE_PYTHON_COMPILER_URL;else process.env.OMNICOMPILE_PYTHON_COMPILER_URL=oldUrl;
      if(oldFile===undefined)delete process.env.OMNICOMPILE_COMPILER_TOKEN_FILE;else process.env.OMNICOMPILE_COMPILER_TOKEN_FILE=oldFile;
      await app.close();await rm(directory,{recursive:true,force:true});
    }
  });
});
