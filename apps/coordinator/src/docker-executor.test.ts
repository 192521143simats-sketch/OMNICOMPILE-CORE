import {describe,it,expect} from 'vitest';
import {createDockerExecutor,runDockerJob} from './docker-executor.js';
import {dockerJobSchema,type DockerJob} from './docker-executor-schema.js';

const token='x'.repeat(64);
const job:DockerJob={kind:'task',language:'c',payload:{operation:'c_compile',sourceName:'main.c',source:'int main(void){return 0;}'}};

describe('Docker execution broker boundary',()=>{
  it('rejects unauthenticated, arbitrary and mismatched requests before running Docker',async()=>{
    let calls=0;const app=createDockerExecutor(token,async()=>{calls++;return {};});
    try{
      expect((await app.inject({method:'POST',url:'/jobs',payload:job})).statusCode).toBe(401);
      expect((await app.inject({method:'POST',url:'/jobs',headers:{'content-type':'application/json'},payload:'{invalid json'})).statusCode).toBe(401);
      const headers={authorization:`Bearer ${token}`};
      for(const payload of [{...job,command:'sh'}, {...job,language:'python'}, {...job,payload:{...job.payload,sourceName:'../secrets'}}, {...job,kind:'shell'}]){
        expect((await app.inject({method:'POST',url:'/jobs',headers,payload})).statusCode).toBe(400);
      }
      expect(calls).toBe(0);
      expect((await app.inject({method:'POST',url:'/jobs',headers,payload:job})).statusCode).toBe(200);
      expect(calls).toBe(1);
    }finally{await app.close();}
  });

  it('bounds concurrent admission and rejects a third job',async()=>{
    const releases:Array<(value:unknown)=>void>=[];
    let admitted:()=>void=()=>{};
    const admission=new Promise<void>(resolve=>{admitted=resolve;});
    const app=createDockerExecutor(token,()=>new Promise(resolve=>{releases.push(resolve);if(releases.length===2)admitted();}));
    await app.ready();
    const request={method:'POST' as const,url:'/jobs',headers:{authorization:`Bearer ${token}`},payload:job};
    const first=app.inject(request).then(result=>result),second=app.inject(request).then(result=>result);
    try{
      await admission;
      expect(releases).toHaveLength(2);
      expect((await app.inject(request)).statusCode).toBe(429);
    }finally{for(const release of releases)release({});await Promise.all([first,second]);await app.close();}
  });

  it('creates a fixed, secret-free language container and validates ownership before cleanup',async()=>{
    const commands:string[][]=[];let owner='';
    const result=await runDockerJob(job,new AbortController().signal,async(args)=>{
      commands.push(args);
      if(args[0]==='create')owner=args[args.indexOf('--label')+1]!.split('=')[1]!;
      return {code:0,stdout:args[0]==='start'?JSON.stringify({ok:true,result:{accepted:true}}):args[0]==='inspect'?owner:'owned-container'};
    });
    expect(result).toEqual({accepted:true});
    const created=commands[0]!;
    expect(created).toContain('omnicompile-c-worker:local');
    expect(created).toContain('none');expect(created).toContain('--read-only');expect(created).toContain('--memory');
    expect(created).toContain('--pids-limit');expect(created).toContain('1000:1000');
    expect(created).not.toContain('--mount');expect(created).not.toContain('--volume');expect(created).not.toContain('--privileged');
    expect(created.join(' ')).not.toContain('docker.sock');
    expect(commands.at(-1)?.slice(0,2)).toEqual(['rm','--force']);
  });

  it('removes an owned job after an interrupted create and preserves an unrelated name',async()=>{
    let owner='',removed=false;
    await expect(runDockerJob(job,new AbortController().signal,async(args)=>{
      if(args[0]==='create'){owner=args[args.indexOf('--label')+1]!.split('=')[1]!;throw new Error('Interrupted request');}
      if(args[0]==='inspect')return {code:0,stdout:owner};
      removed=true;return {code:0,stdout:''};
    })).rejects.toThrow('Interrupted request');
    expect(removed).toBe(true);
    removed=false;
    await expect(runDockerJob(job,new AbortController().signal,async(args)=>{
      if(args[0]==='inspect')return {code:0,stdout:'someone-else'};
      if(args[0]==='rm')removed=true;
      return {code:0,stdout:args[0]==='start'?'invalid JSON':''};
    })).rejects.toThrow('ownership');
    expect(removed).toBe(false);
  });

  it('requires payload language agreement and excludes arbitrary portable operations',()=>{
    expect(dockerJobSchema.safeParse({...job,payload:{operation:'prime_count',limit:5}}).success).toBe(false);
    expect(dockerJobSchema.safeParse({...job,kind:'execute',payload:{language:'java',sourceName:'Main.java',generatedSource:''}}).success).toBe(false);
  });
});
