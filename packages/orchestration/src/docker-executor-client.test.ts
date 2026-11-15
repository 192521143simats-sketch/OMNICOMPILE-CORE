import {afterAll,afterEach,expect,it,vi} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {acknowledgeExecutionReceipt,requestDockerJob} from './docker-executor-client.js';
vi.mock('node:timers/promises',{spy:true});
const dir=mkdtempSync(join(tmpdir(),'omni-client-'));
const credential=join(dir,'token');writeFileSync(credential,'x'.repeat(64));
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks();});
afterAll(()=>rmSync(dir,{recursive:true,force:true}));
it('acknowledges an authenticated receipt and preserves pending errors',async()=>{
 vi.stubEnv('OMNICOMPILE_EXECUTOR_URL','http://executor.test');vi.stubEnv('OMNICOMPILE_EXECUTOR_TOKEN_FILE',credential);
 const id='d93b378d-66ca-4ce3-83ba-a2869ae27083';
 const fetchAck=vi.fn()
   .mockResolvedValueOnce(new Response(null,{status:204}))
   .mockResolvedValueOnce(Response.json({error:{code:'EXECUTION_REQUEST_PENDING'}},{status:409}));
 vi.stubGlobal('fetch',fetchAck);
 await expect(acknowledgeExecutionReceipt(id)).resolves.toBeUndefined();
 expect(fetchAck).toHaveBeenCalledWith(new URL(`http://executor.test/execution-receipts/${id}/ack`),expect.objectContaining({
   method:'POST',headers:{authorization:'Bearer '+ 'x'.repeat(64)}
 }));
 await expect(acknowledgeExecutionReceipt(id)).rejects.toMatchObject({statusCode:409,code:'EXECUTION_REQUEST_PENDING'});
});
it('reports monotonic first-429-to-dispatch wait including an initial zero',async()=>{
 vi.stubEnv('OMNICOMPILE_EXECUTOR_URL','http://executor.test');vi.stubEnv('OMNICOMPILE_EXECUTOR_TOKEN_FILE',credential);
 const now=vi.spyOn(performance,'now');now.mockReturnValueOnce(100).mockReturnValueOnce(350.9).mockReturnValueOnce(800.7);
 const headers:Headers[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url,options)=>{headers.push(new Headers(options.headers));return headers.length<3?new Response('{}',{status:429}):Response.json({result:'ok'});}));
 const requestId='d93b378d-66ca-4ce3-83ba-a2869ae27083';
 expect(await requestDockerJob({kind:'execute',language:'python',payload:{}},undefined,requestId)).toBe('ok');
 expect(headers.map(h=>h.get('x-omnicompile-capacity-retry-wait-ms'))).toEqual(['0','250','700']);
 expect(headers.map(h=>h.get('x-omnicompile-execution-request-id'))).toEqual([requestId,requestId,requestId]);
});

it('cancels a capacity wait without submitting another execution',async()=>{
 vi.stubEnv('OMNICOMPILE_EXECUTOR_URL','http://executor.test');vi.stubEnv('OMNICOMPILE_EXECUTOR_TOKEN_FILE',credential);
 const controller=new AbortController();
 const fetchJob=vi.fn(async()=>{controller.abort();return new Response('{}',{status:429});});
 vi.stubGlobal('fetch',fetchJob);
 await expect(requestDockerJob({kind:'execute',language:'python',payload:{}},controller.signal)).rejects.toMatchObject({name:'AbortError'});
 expect(fetchJob).toHaveBeenCalledTimes(1);
});

it('spreads repeated capacity retries and caps the delay at two seconds',async()=>{
 vi.stubEnv('OMNICOMPILE_EXECUTOR_URL','http://executor.test');vi.stubEnv('OMNICOMPILE_EXECUTOR_TOKEN_FILE',credential);
 const delays=vi.mocked(delay);
 delays.mockClear();
 for(let i=0;i<5;i++)delays.mockResolvedValueOnce(undefined);
 const random=vi.spyOn(Math,'random').mockReturnValue(0.5);
 random.mockReturnValueOnce(0).mockReturnValueOnce(0.999);
 let attempts=0;
 vi.stubGlobal('fetch',vi.fn(async()=>++attempts<=5?new Response(null,{status:429}):Response.json({result:'ok'})));
 expect(await requestDockerJob({kind:'execute',language:'python',payload:{}})).toBe('ok');
 expect(delays.mock.calls.map(([ms])=>ms)).toEqual([250,999,1500,1500,1500]);
});
