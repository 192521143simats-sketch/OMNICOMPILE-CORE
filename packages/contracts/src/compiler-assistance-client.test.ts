import {afterEach,expect,it,vi} from 'vitest';
import {requestCompilerAssistance} from './compiler-assistance-client.js';
afterEach(()=>vi.unstubAllGlobals());
it('sends only leased identity with protected cookie/bearer transport and no redirects',async()=>{
 const fetch=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify({result:{operation:'python_compile'},executionTimeMs:12,assistance:{method:'server-assisted compilation'}}),{headers:{'content-type':'application/json'}}));vi.stubGlobal('fetch',fetch);
 await requestCompilerAssistance({origin:'wss://compiler.example/ws/worker',taskId:'TASK-1',attempt:2,credential:'private-fixture',signal:new AbortController().signal});
 expect(String(fetch.mock.calls[0]![0])).toBe('https://compiler.example/api/worker/compiler');
 const request=fetch.mock.calls[0]![1] as any;expect(request.redirect).toBe('error');expect(request.credentials).toBe('include');expect(JSON.parse(request.body)).toEqual({taskId:'TASK-1',attempt:2});
 expect(request.headers.authorization).toBe('Bearer private-fixture');
});
it('preserves server compiler locations and rejects oversized transfers',async()=>{
 vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({error:{message:'Invalid source',diagnostics:[{severity:'error',message:'missing symbol',line:4,column:2}]}}),{status:422}));
 const options={origin:'https://compiler.example',taskId:'TASK-1',attempt:1,signal:new AbortController().signal};
 await expect(requestCompilerAssistance(options)).rejects.toMatchObject({diagnostics:[{line:4,column:2}]});
 vi.stubGlobal('fetch',async()=>new Response('{}',{headers:{'content-length':'32000001'}}));
 await expect(requestCompilerAssistance(options)).rejects.toThrow('transfer limit');
});
