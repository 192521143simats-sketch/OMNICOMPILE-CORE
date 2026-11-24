// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {CompilerMetrics} from './compiler-metrics.js';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const empty={scope:'OWN_JOBS',observedAt:'2026-11-01T10:00:00Z',tasks:{successful:0,failed:0,timedOut:0,cancelled:0,pending:0,running:0,totalCompleted:0,successRate:null,trend:[]},completion:{averageMs:null,count:0,platforms:[]},availability:{registered:0,connected:0,available:0,busy:0,disconnected:0,unhealthy:0,percentage:null,platforms:[],history:[]},resources:{cpuPercent:null,ramPercent:null,cpuReadings:0,ramReadings:0,lastUpdatedAt:null,platforms:[]},verification:{verified:0,rejected:0,failed:0,pending:0,completed:0,rate:null,history:[]}};
const response=(body:any)=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
async function mount(){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);return{host,root,close:async()=>{await act(async()=>root.unmount());host.remove();}};}
it('renders six live indicators without manufacturing percentages or unavailable telemetry',async()=>{
  const fetcher=vi.fn(async(_path:string)=>response(empty));vi.stubGlobal('fetch',fetcher);const view=await mount();
  try{await act(async()=>view.root.render(<CompilerMetrics jobId="JOB-TEST" language="c"/>));expect(view.host.querySelectorAll('article')).toHaveLength(6);expect(view.host.textContent).toContain('Not available');expect(view.host.textContent).not.toContain('0.0%');expect(view.host.textContent).toContain('Compilation task turnaround time');expect(view.host.textContent).toContain('your jobs');expect(fetcher.mock.calls[0]?.[0]).toContain('/api/user/compiler-metrics?language=c');}finally{await view.close();}
});
it('displays actual counts, separate CPU and RAM, method-labelled verification and trends',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>response({...empty,tasks:{...empty.tasks,successful:2,failed:1,totalCompleted:3,successRate:66.666,trend:[{date:'2026-11-01',successful:2,failed:1,timedOut:0,totalCompleted:3,successRate:66.666}]},completion:{averageMs:153.5,count:2,platforms:[{platform:'WINDOWS',count:2,averageMs:153.5}]},resources:{...empty.resources,cpuPercent:23.5,cpuReadings:4},verification:{...empty.verification,verified:2,rejected:1,completed:3,rate:66.666,history:[{taskId:'TASK-1',workerId:'NODE-A001',outcome:'VERIFIED',method:'independent-recomputation',receivedAt:'2026-11-01T10:00:00Z',completedAt:'2026-11-01T10:00:01Z'}]}})));const view=await mount();
  try{await act(async()=>view.root.render(<CompilerMetrics jobId="JOB-TEST"/>));expect(view.host.textContent).toContain('66.7%');expect(view.host.textContent).toContain('153.5 ms');expect(view.host.textContent).toContain('23.5%');expect(view.host.textContent).not.toContain('Verification history and methods');expect(view.host.textContent).not.toContain('Historical success trend');expect(view.host.textContent).not.toContain('Availability history');expect(view.host.textContent).not.toContain('Verification history and methods');}finally{await view.close();}
});
it('aborts an old job request, clears its data and ignores late responses after a scope change',async()=>{
  const pending:Array<{resolve:(value:Response)=>void;signal:AbortSignal}>=[];vi.stubGlobal('fetch',vi.fn((_path:string,init:RequestInit)=>new Promise<Response>(resolve=>pending.push({resolve,signal:init.signal!}))));const view=await mount();
  try{await act(async()=>view.root.render(<CompilerMetrics jobId="JOB-OLD"/>));await act(async()=>view.root.render(<CompilerMetrics jobId="JOB-NEW"/>));expect(pending[0]!.signal.aborted).toBe(true);await act(async()=>{pending[0]!.resolve(response({...empty,tasks:{...empty.tasks,successful:999}}));pending[1]!.resolve(response(empty));});expect(view.host.textContent).not.toContain('999');}finally{await view.close();}
});
it('polls after completion without overlapping pending requests and aborts on unmount',async()=>{
  vi.useFakeTimers();const pending:Array<{resolve:(value:Response)=>void;signal:AbortSignal}>=[];const fetcher=vi.fn((_path:string,init:RequestInit)=>new Promise<Response>(resolve=>pending.push({resolve,signal:init.signal!})));vi.stubGlobal('fetch',fetcher);const view=await mount();
  await act(async()=>view.root.render(<CompilerMetrics jobId="JOB-TEST"/>));await act(async()=>vi.advanceTimersByTime(9000));expect(fetcher).toHaveBeenCalledTimes(1);await act(async()=>pending[0]!.resolve(response(empty)));await act(async()=>vi.advanceTimersByTime(3000));expect(fetcher).toHaveBeenCalledTimes(2);await view.close();expect(pending[1]!.signal.aborted).toBe(true);
});
it('sends only selected job/language/platform filters and keeps the selected compilation scoped',async()=>{
  const fetcher=vi.fn(async(_path:string)=>response(empty));vi.stubGlobal('fetch',fetcher);const view=await mount();
  try{
    await act(async()=>view.root.render(<CompilerMetrics jobId="JOB-AB123" language="python"/>));
    const platform=view.host.querySelector<HTMLSelectElement>('[aria-label="Metrics platform"]')!;
    await act(async()=>{platform.value='ANDROID';platform.dispatchEvent(new Event('change',{bubbles:true}));});
    expect(fetcher.mock.calls.at(-1)![0]).toBe('/api/user/compiler-metrics?language=python&platform=ANDROID&jobId=JOB-AB123');
    const scope=view.host.querySelector<HTMLSelectElement>('[aria-label="Metrics scope"]')!;
    expect(scope.querySelector('option[value=history]')).toBeNull();
    expect(fetcher.mock.calls.at(-1)![0]).toBe('/api/user/compiler-metrics?language=python&platform=ANDROID&jobId=JOB-AB123');
  }finally{await view.close();}
});
it('labels retained values stale when a later poll fails instead of presenting a false live success',async()=>{
  vi.useFakeTimers();const fetcher=vi.fn().mockResolvedValueOnce(response(empty)).mockRejectedValueOnce(new Error('Network unavailable'));vi.stubGlobal('fetch',fetcher);const view=await mount();
  try{await act(async()=>view.root.render(<CompilerMetrics jobId="JOB-TEST"/>));await act(async()=>vi.advanceTimersByTime(3000));expect(view.host.textContent).toContain('Last values may be stale');expect(view.host.textContent).toContain('Updates interrupted');expect(view.host.querySelector('[role="alert"]')?.textContent).toContain('Unable to reach');}finally{await view.close();}
});
it('shows only device platforms for timing and availability while retaining assistance in totals and resource measurements',async()=>{
 const platforms=['WEB','WINDOWS','ANDROID','CLOUD','NATIVE_OTHER'];
 vi.stubGlobal('fetch',vi.fn(async()=>response({...empty,
  completion:{averageMs:100,count:5,platforms:platforms.map(platform=>({platform,averageMs:100,count:1}))},
  availability:{...empty.availability,registered:5,connected:5,platforms:platforms.map(platform=>({...empty.availability,platform,registered:1,connected:1}))},
  resources:{...empty.resources,platforms:platforms.map(platform=>({...empty.resources,platform}))}
 })));const view=await mount();
 try{
  await act(async()=>view.root.render(<CompilerMetrics jobId="JOB-TEST"/>));
  const selector=view.host.querySelector<HTMLSelectElement>('[aria-label="Metrics platform"]')!;
  expect(Array.from(selector.options).map(option=>option.value)).toEqual(['','WEB','WINDOWS','ANDROID']);
  for(const index of [1,3]){const card=view.host.querySelectorAll('article')[index]!;expect(card.textContent).not.toContain('Other native');expect(card.querySelector('table')!.querySelectorAll('tbody tr')).toHaveLength(3);}
  expect(view.host.textContent).not.toContain('Historical success trend');expect(view.host.textContent).not.toContain('Availability history');expect(view.host.textContent).not.toContain('Verification history and methods');
  expect(view.host.querySelectorAll('article')[1]!.textContent).toContain('5 successful completed tasks');
  expect(view.host.querySelectorAll('article')[4]!.textContent).toContain('Other native');
 }finally{await view.close();}
});

// Exercise connected behavior independently of the public frontend offline default.
vi.mock('./backend-config.js',()=>({backendConfig:{mode:'remote',apiBaseUrl:null,wsBaseUrl:null},isBackendAvailable:()=>true}));

it('shows genuine per-job optimization measurements and explicitly unmeasured runtime speedup',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>response({...empty,optimization:{jobsMeasured:1,items:[{jobId:'JOB-PY',version:1,language:'python',method:'AST constant folding',transformations:2,measurement:{unit:'ast-nodes',before:10,after:8,reductionPercent:20},compiler:{name:'CPython',version:'3.12',options:['-O']},artifactBytes:80,runtimeSpeedupPercent:null,deadCodeElimination:{status:'applied',method:'Unreachable statements',removedStatements:2,removedInstructions:null}}]}})));const view=await mount();
 try{await act(async()=>view.root.render(<CompilerMetrics jobId="JOB-TEST"/>));const card=view.host.querySelectorAll('article')[2]!;expect(card.textContent).toContain('Optimization evidence');expect(card.textContent).toContain('10 → 8 ast-nodes');expect(card.textContent).toContain('20%');expect(card.textContent).toContain('CPython 3.12');expect(card.textContent).toContain('Not measured');expect(card.textContent).not.toContain('faster');expect(card.textContent).toContain('Dead-code eliminationapplied');expect(card.textContent).toContain('Removed statements2');expect(card.textContent).toContain('Removed instructionsNot measured');}finally{await view.close();}
});

it('uses the final job outcome and full turnaround instead of a successful intermediate compile task',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>response({...empty,tasks:{...empty.tasks,successful:1,totalCompleted:1,successRate:100},jobResult:{status:'FAILED',successful:0,failed:1,totalCompleted:1,successRate:0,totalDurationMs:3365,programRuntimeMs:10},completion:{...empty.completion,averageMs:120,count:1}})));
 const view=await mount();try{await act(async()=>view.root.render(<CompilerMetrics jobId="JOB-RUNTIME-FAIL"/>));const cards=view.host.querySelectorAll('article');expect(cards[0]!.textContent).toContain('0%');expect(cards[0]!.textContent).toContain('0 / 1');expect(cards[1]!.textContent).toContain('3,365 ms');expect(cards[1]!.textContent).toContain('program runtime');}finally{await view.close();}
});
it('does not load unrelated previous jobs before a compilation is selected',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const view=await mount();try{await act(async()=>view.root.render(<CompilerMetrics/>));expect(fetcher).not.toHaveBeenCalled();expect(view.host.textContent).toContain('Submit a compilation');}finally{await view.close();}
});
