import {expect,it} from 'vitest';
import {evaluateNode,type SchedulableNode} from './scheduler.js';
const node:SchedulableNode={id:'device',networkId:'network',status:'AVAILABLE',profile:{workerType:'BROWSER',deviceType:'DESKTOP',cpuModel:'browser',logicalCores:2,totalMemoryBytes:0,operatingSystem:'Browser',architecture:'browser',runtimes:{c:false,python:false,java:false},toolchains:{c:{available:false},python:{available:false},java:{available:false}},operations:{irOptimization:true,staticAnalysis:false,browserCompute:true,nativeCompilation:false,serverAssistedCompilation:true}},resources:{cpuUtilizationPercent:0,cpuMeasurementAvailable:false,freeMemoryBytes:0,memoryUtilizationPercent:0,memoryMeasurementAvailable:false,observedAt:new Date().toISOString()}};
it('requires a server tool service and honest assistance negotiation rather than invented native tools',()=>{
 const requirements={capability:'java' as const,operation:'java_compile',maxDurationMs:30000,maxMemoryBytes:536870912,minFreeMemoryBytes:1048576};
 expect(evaluateNode(node,requirements).eligible).toBe(false);
 expect(evaluateNode(node,requirements,{toolServiceAvailable:true}).eligible).toBe(true);
 expect(evaluateNode({...node,profile:{...node.profile,operations:{...node.profile.operations,serverAssistedCompilation:false}}},requirements,{toolServiceAvailable:true}).eligible).toBe(false);
 expect(node.profile.runtimes.java).toBe(false);
 expect(evaluateNode({...node,executionLocation:'CLOUD'},requirements,{toolServiceAvailable:true}).eligible).toBe(false);
});
