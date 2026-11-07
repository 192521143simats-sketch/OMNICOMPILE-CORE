import {expect,it} from 'vitest';
import {summarizeCompilerMetrics,qualifyMetricWorkers} from './compiler-metrics.js';
it('counts terminal tasks once, excludes cancellation/pending and measures dispatch to receipt',()=>{
 const at='2026-11-01T10:00:00.000Z';
 const data=summarizeCompilerMetrics({tasks:[{id:'t1',status:'COMPLETED',assignedAt:at,receivedAt:'2026-11-01T10:00:00.120Z',completedAt:at,platform:'WINDOWS'},{id:'t2',status:'FAILED',failureReason:'TIMEOUT',completedAt:at,platform:'WEB'},{id:'t3',status:'FAILED',completedAt:at},{id:'t4',status:'CANCELLED'},{id:'t5',status:'REQUEUED'}],workers:[],telemetry:[],verifications:[],availability:[]},Date.parse(at));
 expect(data.tasks).toMatchObject({successful:1,failed:1,timedOut:1,cancelled:1,pending:1,totalCompleted:3,successRate:100/3});
 expect(data.completion).toMatchObject({averageMs:120,count:1});
 expect(data.tasks.trend[0]).toMatchObject({successful:1,failed:1,timedOut:1});
});
it('does not count a closed unavailable socket as connected or a resource-ineligible worker as available',()=>{
 const at='2026-11-01T10:00:00Z',now=Date.parse(at);
 const data=summarizeCompilerMetrics({tasks:[],workers:[{id:'a',platform:'WEB',status:'UNAVAILABLE',lastHeartbeat:at},{id:'b',platform:'WEB',status:'AVAILABLE',lastHeartbeat:at,eligible:false}],telemetry:[],verifications:[],availability:[]},now);
 expect(data.availability).toMatchObject({registered:2,connected:1,available:0,unhealthy:1,percentage:0});
 expect(qualifyMetricWorkers([{id:'c',status:'AVAILABLE',profile:null,resources:null,capability:'ir'}])[0]?.eligible).toBe(false);
 const disconnected=summarizeCompilerMetrics({tasks:[],workers:[{id:'lost',status:'AVAILABLE',lastHeartbeat:at,connected:false}],telemetry:[],verifications:[],availability:[]},now);
 expect(disconnected.availability).toMatchObject({registered:1,connected:0,available:0,disconnected:1});
});
it('uses persisted reliability and execution budget when determining availability',()=>{
 const at=new Date().toISOString();const worker={id:'trusted-history',status:'AVAILABLE',lastHeartbeat:at,profile:{workerType:'BROWSER',operations:{irOptimization:true},logicalCores:2},resources:{cpuUtilizationPercent:0,cpuMeasurementAvailable:false,memoryUtilizationPercent:0,memoryMeasurementAvailable:false,freeMemoryBytes:0,observedAt:at},capability:'ir',taskKind:'C_OPTIMIZE_IR',operation:'c_optimize_ir',timeoutMs:20000,configuration:{policy:{minReliability:.5}},reliabilitySamples:2,reliabilityRate:1};
 expect(qualifyMetricWorkers([worker])[0]?.eligible).toBe(true);
 expect(qualifyMetricWorkers([{...worker,reliabilitySamples:0,reliabilityRate:null}])[0]?.eligible).toBe(false);
});
it('does not invent zero resource readings or percentages and excludes stale observations',()=>{
 const now=Date.parse('2026-11-01T10:00:00Z');
 const data=summarizeCompilerMetrics({tasks:[],workers:[{id:'n',platform:'WEB',status:'AVAILABLE',lastHeartbeat:'2026-11-01T09:00:00Z'}],telemetry:[{platform:'WEB',cpuPercent:null,ramPercent:null,observedAt:'2026-11-01T10:00:00Z'},{platform:'WINDOWS',cpuPercent:90,ramPercent:50,observedAt:'2026-11-01T09:00:00Z'}],verifications:[],availability:[]},now);
 expect(data.tasks.successRate).toBeNull();expect(data.resources.cpuPercent).toBeNull();expect(data.resources.ramPercent).toBeNull();expect(data.availability).toMatchObject({registered:1,available:0,disconnected:1,percentage:0});expect(data.verification.rate).toBeNull();
});
it('separates CPU/RAM valid readings and verification outcomes',()=>{
 const at='2026-11-01T10:00:00Z';
 const data=summarizeCompilerMetrics({tasks:[],workers:[],telemetry:[{platform:'WINDOWS',cpuPercent:20,ramPercent:null,observedAt:at},{platform:'ANDROID',cpuPercent:40,ramPercent:60,observedAt:at}],verifications:[{outcome:'VERIFIED'},{outcome:'REJECTED'},{outcome:'FAILED'},{outcome:'PENDING'}],availability:[]},Date.parse(at));
 expect(data.resources).toMatchObject({cpuPercent:30,ramPercent:60,cpuReadings:2,ramReadings:1});expect(data.verification).toMatchObject({verified:1,rejected:1,failed:1,pending:1,completed:3,rate:100/3});
});
it('includes cloud and other native task, worker and telemetry measurements without relabelling them as Windows',()=>{
 const at='2026-11-01T10:00:00.000Z';
 const data=summarizeCompilerMetrics({tasks:[
  {status:'COMPLETED',platform:'CLOUD',assignedAt:at,receivedAt:'2026-11-01T10:00:00.120Z'},
  {status:'COMPLETED',platform:'NATIVE_OTHER',assignedAt:at,receivedAt:'2026-11-01T10:00:00.240Z'}
 ],workers:[{id:'cloud',platform:'CLOUD',status:'AVAILABLE',lastHeartbeat:at}],telemetry:[{platform:'CLOUD',cpuPercent:30,ramPercent:50,observedAt:at}],verifications:[],availability:[]},Date.parse(at));
 expect(data.completion.platforms.find(row=>row.platform==='CLOUD')).toMatchObject({count:1,averageMs:120});
 expect(data.completion.platforms.find(row=>row.platform==='NATIVE_OTHER')).toMatchObject({count:1,averageMs:240});
 expect(data.completion.platforms.find(row=>row.platform==='WINDOWS')).toMatchObject({count:0,averageMs:null});
 expect(data.availability.platforms.find(row=>row.platform==='CLOUD')).toMatchObject({registered:1,available:1,percentage:100});
 expect(data.resources.platforms.find(row=>row.platform==='CLOUD')).toMatchObject({cpuPercent:30,ramPercent:50,cpuReadings:1,ramReadings:1});
});
