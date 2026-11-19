import {EventEmitter} from 'node:events';
import {afterEach, expect, it, vi} from 'vitest';
const {requestMock}=vi.hoisted(()=>({requestMock:vi.fn()}));
vi.mock('node:https',()=>({request:requestMock}));
vi.mock('node:fs/promises',()=>({readFile:vi.fn(async(path:string)=>path.endsWith('/token')?'owned-token':Buffer.from('owned-ca'))}));
import {inClusterApi} from './kubernetes-execution.js';
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
it('uses Kubernetes merge-patch content type only for PATCH requests',async()=>{
  vi.stubEnv('KUBERNETES_SERVICE_HOST','fixture.invalid');
  requestMock.mockImplementation((_options:unknown,respond:(response:EventEmitter)=>void)=>{
    const req=new EventEmitter();
    return Object.assign(req,{end:()=>{
      const response=Object.assign(new EventEmitter(),{statusCode:200});
      respond(response); response.emit('data',Buffer.from('{}')); response.emit('end');
    }});
  });
  const api=inClusterApi();
  for(const method of ['PATCH','POST','DELETE','GET']){
    await api(method,'/api/v1/namespaces/fixture/pods/owned',{metadata:{uid:'owned'}});
    expect(requestMock.mock.calls.at(-1)?.[0].headers['Content-Type'])
      .toBe(method==='PATCH'?'application/merge-patch+json':'application/json');
  }
});
