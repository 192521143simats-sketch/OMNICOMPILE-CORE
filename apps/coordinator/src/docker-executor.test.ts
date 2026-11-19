import {describe,it,expect,vi} from 'vitest';
import type {Pool} from 'mysql2/promise';
import {KubernetesExecutionProvider} from './kubernetes-execution.js';
import {createDockerExecutor,resolveToolchainImages,runDockerJob} from './docker-executor.js';
import {dockerJobSchema,prewarmStatusSchema,type DockerJob} from './docker-executor-schema.js';

const token='x'.repeat(64);
const job:DockerJob={kind:'task',language:'c',payload:{operation:'c_compile',sourceName:'main.c',source:'int main(void){return 0;}'}};

describe('Docker execution broker boundary',()=>{
  it('requires broker authentication before inspecting configured toolchain images', async () => {
    const inspected: string[][] = [];
    const imageId = `sha256:${'a'.repeat(64)}`;
    const app = createDockerExecutor(token, undefined, {command: async args => {
      inspected.push(args);
      if (args.at(-1)?.includes('python')) return {code: 1, stdout: 'internal Docker diagnostic'};
      if (args.at(-1)?.includes('java')) return {code: 0, stdout: 'malformed image ID'};
      return {code: 0, stdout: `${imageId}\n`};
    }});
    try {
      expect((await app.inject('/capabilities')).statusCode).toBe(401);
      expect((await app.inject({url: '/capabilities', headers: {authorization: `Bearer ${'y'.repeat(64)}`}})).statusCode).toBe(401);
      expect(inspected).toEqual([]);

      const response = await app.inject({url: '/capabilities', headers: {authorization: `Bearer ${token}`}});
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.json()).toEqual({provider: 'docker', toolchains: [
        {language: 'c', reference: 'omnicompile-c-worker:local', available: true, imageId},
        {language: 'python', reference: 'omnicompile-python-worker:local', available: false, imageId: null},
        {language: 'java', reference: 'omnicompile-java-worker:local', available: false, imageId: null},
      ]});
      expect(inspected).toEqual(['c', 'python', 'java'].map(language =>
        ['image', 'inspect', '--format', '{{.Id}}', `omnicompile-${language}-worker:local`]));
    } finally {
      await app.close();
    }
  });

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

  it('uses operator-pinned toolchain images consistently for readiness and execution', async () => {
    const image = (language: string) => `registry.example.test/omnicompile/${language}@sha256:${'a'.repeat(64)}`;
    const images = resolveToolchainImages({
      OMNICOMPILE_EXECUTOR_IMAGE_C: image('c'),
      OMNICOMPILE_EXECUTOR_IMAGE_PYTHON: image('python'),
      OMNICOMPILE_EXECUTOR_IMAGE_JAVA: image('java'),
    });
    const commands: string[][] = [];
    let owner = '';
    const app = createDockerExecutor(token, undefined, {images, command: async args => {
      commands.push(args);
      if (args[0] === 'create') owner = args[args.indexOf('--label') + 1]!.split('=')[1]!;
      return {code: 0, stdout: args[0] === 'start' ? JSON.stringify({ok: true, result: {accepted: true}}) : owner};
    }});
    try {
      expect((await app.inject({method: 'GET', url: '/ready'})).statusCode).toBe(200);
      expect(commands[0]).toEqual(['image', 'inspect', '--format', '{{.Id}}', ...Object.values(images)]);
      const response = await app.inject({method: 'POST', url: '/jobs', headers: {authorization: `Bearer ${token}`}, payload: job});
      expect(response.json()).toEqual({result: {accepted: true}});
      const create = commands.find(args => args[0] === 'create');
      expect(create).toContain(images.c);
      expect(create).not.toContain('omnicompile-c-worker:local');
      expect(create?.slice(1, 3)).toEqual(['--pull', 'never']);
    } finally {
      await app.close();
    }
  });

  it('rejects partial, mutable or option-like release image configuration', () => {
    const image = `registry.example.test/omnicompile/toolchain@sha256:${'a'.repeat(64)}`;
    expect(resolveToolchainImages({}).python).toBe('omnicompile-python-worker:local');
    expect(() => resolveToolchainImages({OMNICOMPILE_EXECUTOR_IMAGE_C: image})).toThrow('all three');
    for (const invalid of ['registry.example.test/omnicompile/c:latest', `--flag@${image.split('@')[1]}`, '']) {
      expect(() => resolveToolchainImages({
        OMNICOMPILE_EXECUTOR_IMAGE_C: invalid,
        OMNICOMPILE_EXECUTOR_IMAGE_PYTHON: image,
        OMNICOMPILE_EXECUTOR_IMAGE_JAVA: image,
      })).toThrow('immutable');
    }
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
      const full=await app.inject({url:'/executions',headers:request.headers});
      expect(full.json()).toEqual({provider:'docker',items:[],prewarm:null,capacity:{busy:2,limit:2}});
      expect(releases).toHaveLength(2);
      expect((await app.inject(request)).statusCode).toBe(429);
      for(const release of releases)release({});
      await Promise.all([first,second]);
      const idle=await app.inject({url:'/executions',headers:request.headers});
      expect(idle.json()).toEqual({provider:'docker',items:[],prewarm:null,capacity:{busy:0,limit:2}});
    }finally{for(const release of releases)release({});await Promise.all([first,second]);await app.close();}
  });

  it('reports SQL slot occupancy only to authenticated clients, including slots held for cleanup', async () => {
    const cleanup = {id:'fixture-cleanup', state:'CLEANUP_PENDING', slot:1};
    const completed = {id:'fixture-completed', state:'SUCCEEDED', slot:null};
    const records = [cleanup, completed];
    const query = vi.fn(async (sql: string) => {
      if (/COUNT\(\*\).*FROM kubernetes_executions WHERE slot IS NOT NULL/is.test(sql)) {
        return [[{busy: records.filter(row => row.slot !== null).length}]];
      }
      if (sql.includes('FROM kubernetes_prewarm_slots')) return [[{language:'c',state:'RETIRING',expiresAt:new Date('2026-11-19T00:00:00Z'),pod_name:'private-pod'}]];
      if (/ORDER BY created_at DESC,id DESC LIMIT 50/.test(sql)) return [records];
      throw new Error('Unexpected SQL');
    });
    const image = `registry.example.test/omnicompile/toolchain@sha256:${'a'.repeat(64)}`;
    const provider = new KubernetesExecutionProvider({query} as unknown as Pool, vi.fn(), 'fixtures', 'sandbox', {c:image, python:image, java:image});
    const app = createDockerExecutor(token, undefined, {kubernetes:provider});
    const headers = {authorization:`Bearer ${token}`};
    try {
      expect((await app.inject('/executions')).statusCode).toBe(401);
      expect(query).not.toHaveBeenCalled();
      const occupied = await app.inject({url:'/executions',headers});
      expect(occupied.json().prewarm).toEqual({enabled:false,policy:'fixed',observedAt:expect.any(String),slots:[{language:'c',state:'RETIRING',expiresAt:'2026-11-19T00:00:00.000Z'}]});
      expect(occupied.body).not.toContain('private-pod');
      expect(query.mock.calls.some(([sql])=>/FROM kubernetes_prewarm_slots ORDER BY language LIMIT 3/.test(sql))).toBe(true);
      expect(occupied.headers['cache-control']).toBe('no-store');
      expect(occupied.json()).toMatchObject({provider:'kubernetes',capacity:{busy:1,limit:2},items:[{state:'CLEANUP_PENDING'},{state:'SUCCEEDED'}]});
      query.mockImplementation(async sql => {
        if (sql.includes('COUNT(*)')) throw new Error('Private database diagnostic');
        return [records];
      });
      const unavailable = await app.inject({url:'/executions',headers});
      expect(unavailable.statusCode).toBe(503);
      expect(unavailable.body).not.toContain('Private database diagnostic');
      expect(unavailable.json()).not.toHaveProperty('capacity');
    } finally {
      await app.close();
    }
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


it('validates bounded prewarm observations and strips private fields at the admin boundary',()=>{
  const valid={enabled:true,policy:'demand',observedAt:'2026-11-19T00:00:00.000Z',slots:[{language:'java',state:'IDLE',expiresAt:null,pod_name:'private'}]};
  expect(prewarmStatusSchema.parse(valid).slots[0]).not.toHaveProperty('pod_name');
  for(const invalid of [{...valid,observedAt:'bad'},{...valid,policy:'automatic'},
    {...valid,slots:Array(4).fill(valid.slots[0])},{...valid,slots:[{language:'java',state:'READY',expiresAt:null}]}]){
    expect(prewarmStatusSchema.safeParse(invalid).success).toBe(false);
  }
});


it('reports enabled demand policy and bounded empty observations without querying Kubernetes',async()=>{
  const query=vi.fn(async()=>[[]]);
  const cluster=vi.fn();
  const image='fixture/runner@sha256:'+'a'.repeat(64);
  const provider=new KubernetesExecutionProvider({query} as unknown as Pool,cluster,'fixtures','sandbox',{c:image,python:image,java:image},true,'demand');
  const report=await provider.prewarmStatus();
  expect(report).toEqual({enabled:true,policy:'demand',observedAt:expect.any(String),slots:[]});
  expect(Number.isNaN(Date.parse(report.observedAt))).toBe(false);
  expect(query).toHaveBeenCalledTimes(1);
  expect(cluster).not.toHaveBeenCalled();
});
