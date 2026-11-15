import {afterAll,afterEach,expect,it,vi} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {requestDockerJob} from './docker-executor-client.js';
const dir=mkdtempSync(join(tmpdir(),'omni-client-'));
const credential=join(dir,'token');writeFileSync(credential,'x'.repeat(64));
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks();});
afterAll(()=>rmSync(dir,{recursive:true,force:true}));
it('reports monotonic first-429-to-dispatch wait including an initial zero',async()=>{
 vi.stubEnv('OMNICOMPILE_EXECUTOR_URL','http://executor.test');vi.stubEnv('OMNICOMPILE_EXECUTOR_TOKEN_FILE',credential);
 const now=vi.spyOn(performance,'now');now.mockReturnValueOnce(100).mockReturnValueOnce(350.9).mockReturnValueOnce(800.7);
 const headers:Headers[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url,options)=>{headers.push(new Headers(options.headers));return headers.length<3?new Response('{}',{status:429}):Response.json({result:'ok'});}));
 expect(await requestDockerJob({kind:'execute',language:'python',payload:{}})).toBe('ok');
 expect(headers.map(h=>h.get('x-omnicompile-capacity-retry-wait-ms'))).toEqual(['0','250','700']);
});

it('cancels a capacity wait without submitting another execution',async()=>{
 vi.stubEnv('OMNICOMPILE_EXECUTOR_URL','http://executor.test');vi.stubEnv('OMNICOMPILE_EXECUTOR_TOKEN_FILE',credential);
 const controller=new AbortController();
 const fetchJob=vi.fn(async()=>{controller.abort();return new Response('{}',{status:429});});
 vi.stubGlobal('fetch',fetchJob);
 await expect(requestDockerJob({kind:'execute',language:'python',payload:{}},controller.signal)).rejects.toMatchObject({name:'AbortError'});
 expect(fetchJob).toHaveBeenCalledTimes(1);
});
