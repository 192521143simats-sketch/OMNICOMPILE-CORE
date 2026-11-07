import {networkPolicySchema,contributionPolicySchema,resourceSchema,type CapabilityProfile,type ResourceSnapshot,type NetworkPolicy,type ContributionPolicy} from "@omnicompile/contracts";
export * from "./reliability.js";

export type RequiredCapability="base"|"ir"|"c"|"python"|"java";
export type ExecutionMode="CLOUD_ONLY"|"LOCAL_ONLY"|"HYBRID";
export type ExecutionLocation="CLOUD"|"LOCAL";
export type TaskRequirements={
  capability:RequiredCapability;minLogicalCores?:number;minFreeMemoryBytes?:number;requireNativeCSource?:boolean;
  networkId?:string;taskKind?:string;operation?:string;operatingSystem?:string;architecture?:string;toolchainVersion?:string;
  maxDurationMs?:number;maxCpuPercent?:number;maxMemoryBytes?:number;deadlineAt?:string;affinityNodeId?:string;
  executionMode?:ExecutionMode;
};
export type NodePerformance={sampleCount:number;averageExecutionTimeMs:number;successRate:number};
export type SchedulableNode={
  id:string;networkId?:string;status:"AVAILABLE"|string;profile:CapabilityProfile;resources:ResourceSnapshot|null;
  lastHeartbeat?:string;contributionPolicy?:ContributionPolicy;reliability?:{sampleCount:number;successRate:number|null};
  historicalPerformance?:Partial<Record<RequiredCapability,NodePerformance>>;
  executionLocation?:ExecutionLocation;
};
export type SchedulingContext={nowMs?:number;maxResourceAgeMs?:number;policy?:NetworkPolicy};
export type CandidateEvaluation={nodeId:string;eligible:boolean;score:number|null;reasons:string[]};
export type SchedulingDecision={selectedNodeId:string|null;score:number|null;explanation:string;evaluations:CandidateEvaluation[]};

const operationCapabilities:Record<string,RequiredCapability>={sha256:"base",sha256_chain:"base",prime_count:"base",matrix_multiply:"base",portable_benchmark:"base",c_optimize_ir:"ir",c_compile:"c",python_compile:"python",java_compile:"java"};
function supports(profile:CapabilityProfile,capability:RequiredCapability){
  if(capability==="base")return profile.operations.browserCompute;
  if(capability==="ir")return profile.operations.irOptimization;
  return profile.workerType==="NATIVE"&&profile.operations.nativeCompilation&&profile.runtimes[capability]&&profile.toolchains[capability].available;
}
function validHistory(history:NodePerformance|undefined):history is NodePerformance{
  return !!history&&Number.isInteger(history.sampleCount)&&history.sampleCount>0&&Number.isFinite(history.averageExecutionTimeMs)&&history.averageExecutionTimeMs>0&&Number.isFinite(history.successRate)&&history.successRate>=0&&history.successRate<=1;
}

export function evaluateNode(node:SchedulableNode,requirements:TaskRequirements,context:SchedulingContext={}):CandidateEvaluation{
  const reasons:string[]=[],nowMs=context.nowMs??Date.now(),maxAge=context.maxResourceAgeMs??30_000;
  const policyResult=networkPolicySchema.safeParse(context.policy??{});
  const androidDefaults=node.profile.workerType==="ANDROID"?{minBatteryPercent:25,wifiOnly:true,thermalProtection:true,allowBackground:false}:{};
  const contributionResult=contributionPolicySchema.safeParse({...androidDefaults,...(node.contributionPolicy??node.profile.contributionPolicy??{})});
  if(!policyResult.success)reasons.push("network policy is invalid");
  if(!contributionResult.success)reasons.push("contribution policy is invalid");
  const policy=policyResult.success?policyResult.data:{},contribution=contributionResult.success?contributionResult.data:{};
  if(node.status!=="AVAILABLE")reasons.push(`status is ${node.status}`);
  const location=node.executionLocation??"LOCAL";
  if(requirements.executionMode==="CLOUD_ONLY"&&location!=="CLOUD")reasons.push("cloud-only job requires an administrator-designated cloud worker");
  if(requirements.executionMode==="LOCAL_ONLY"&&location!=="LOCAL")reasons.push("local-only job cannot use a cloud worker");
  if(contribution.enabled===false)reasons.push("worker contribution is disabled");
  if(requirements.networkId!==undefined&&node.networkId!==requirements.networkId)reasons.push("worker belongs to another network or network identity is missing");
  if(!supports(node.profile,requirements.capability))reasons.push(`${requirements.capability} capability is unavailable`);
  if(requirements.operation!==undefined){const capability=operationCapabilities[requirements.operation];if(!capability||!supports(node.profile,capability))reasons.push("task operation is unsupported by this worker");}
  if(requirements.operation==="matrix_multiply"&&node.profile.operations.portableMatrix!==true)reasons.push("portable matrix operation was not negotiated");
  if(requirements.operation==="portable_benchmark"&&node.profile.operations.portableBenchmark!==true)reasons.push("portable benchmark operation was not negotiated");
  if(requirements.requireNativeCSource&&node.profile.operations.nativeCSource!==true)reasons.push("native C source task protocol is unavailable");
  if(policy.allowedWorkerTypes&&!policy.allowedWorkerTypes.includes(node.profile.workerType))reasons.push("worker type is disallowed by network policy");
  if(policy.allowedPlatforms&&!policy.allowedPlatforms.includes(node.profile.operatingSystem))reasons.push("platform is disallowed by network policy");
  if(policy.allowedTaskKinds&&(!requirements.taskKind||!policy.allowedTaskKinds.some(kind=>kind===requirements.taskKind)))reasons.push("task kind is missing or disallowed by network policy");
  if(policy.allowedOperations&&(!requirements.operation||!policy.allowedOperations.some(operation=>operation===requirements.operation)))reasons.push("operation is missing or disallowed by network policy");
  if(requirements.operatingSystem&&requirements.operatingSystem!==node.profile.operatingSystem)reasons.push("required operating system does not match");
  if(requirements.architecture&&requirements.architecture!==node.profile.architecture)reasons.push("required architecture does not match");
  if(requirements.toolchainVersion){const capability=requirements.capability;if(capability==="base"||capability==="ir"||node.profile.toolchains[capability].version!==requirements.toolchainVersion)reasons.push("required toolchain version does not match");}
  if(node.profile.logicalCores<(requirements.minLogicalCores??1))reasons.push(`requires at least ${requirements.minLogicalCores} logical cores`);
  for(const [name,value] of Object.entries({minLogicalCores:requirements.minLogicalCores,minFreeMemoryBytes:requirements.minFreeMemoryBytes,maxDurationMs:requirements.maxDurationMs,maxCpuPercent:requirements.maxCpuPercent,maxMemoryBytes:requirements.maxMemoryBytes})){
    if(value!==undefined&&(!Number.isFinite(value)||value<0||((name==="maxDurationMs"||name==="maxMemoryBytes")&&value===0)||(name==="maxCpuPercent"&&value>100)))reasons.push(`invalid task requirement ${name}`);
  }
  if(requirements.deadlineAt){const deadline=Date.parse(requirements.deadlineAt);if(!Number.isFinite(deadline)||deadline<=nowMs||(requirements.maxDurationMs!==undefined&&nowMs+requirements.maxDurationMs>deadline))reasons.push("task deadline cannot be met within its execution budget");}
  const reliability=node.reliability;
  if((policy.minReliability??0)>0&&(!reliability||!Number.isInteger(reliability.sampleCount)||reliability.sampleCount<=0||reliability.successRate===null||!Number.isFinite(reliability.successRate)||reliability.successRate<policy.minReliability!||reliability.successRate>1))reasons.push("worker reliability is unknown or below network minimum");
  if(!node.resources)reasons.push("no current resource snapshot");
  else{
    const resources=node.resources,observedAt=Date.parse(resources.observedAt);
    if(!resourceSchema.safeParse(resources).success)reasons.push("resource snapshot contains invalid readings");
    if(!Number.isFinite(nowMs)||!Number.isFinite(maxAge)||maxAge<0||!Number.isFinite(observedAt)||nowMs-observedAt>maxAge||observedAt-nowMs>5000)reasons.push("resource snapshot is stale or has an invalid timestamp");
    if(node.lastHeartbeat){const heartbeat=Date.parse(node.lastHeartbeat);if(!Number.isFinite(heartbeat)||nowMs-heartbeat>maxAge||heartbeat-nowMs>5000)reasons.push("worker heartbeat is stale or invalid");}
    const memoryKnown=resources.memoryMeasurementAvailable!==false;
    const boundedBrowser=node.profile.workerType==="BROWSER"&&requirements.maxDurationMs!==undefined&&requirements.maxDurationMs<=30_000&&requirements.maxMemoryBytes!==undefined&&requirements.maxMemoryBytes<=64*1024*1024;
    if(!memoryKnown&&node.profile.workerType==="BROWSER"&&!boundedBrowser)reasons.push("browser tasks with unknown memory require bounded duration and memory budgets");
    if(!memoryKnown&&(requirements.minFreeMemoryBytes??0)>0&&!boundedBrowser)reasons.push("required free memory measurement is unavailable");
    else if(memoryKnown&&resources.freeMemoryBytes<(requirements.minFreeMemoryBytes??0))reasons.push(`requires at least ${requirements.minFreeMemoryBytes} free memory bytes`);
    if(resources.lifecycleState==="PAUSED")reasons.push("worker lifecycle is paused");
    if(resources.networkType==="OFFLINE")reasons.push("worker network is offline");
    for(const limits of [policy,contribution]){
      if(limits.maxTaskDurationMs!==undefined&&(requirements.maxDurationMs===undefined||requirements.maxDurationMs>limits.maxTaskDurationMs))reasons.push("task duration budget is missing or exceeds policy maximum");
      if(limits.maxMemoryBytes!==undefined){
        if(!memoryKnown)reasons.push("memory policy requires a known memory measurement");
        if(requirements.maxMemoryBytes===undefined||requirements.maxMemoryBytes>limits.maxMemoryBytes)reasons.push("task memory budget is missing or exceeds policy maximum");
      }
      if(requirements.maxMemoryBytes!==undefined&&memoryKnown&&requirements.maxMemoryBytes>resources.freeMemoryBytes)reasons.push("task memory budget exceeds free memory");
      if(limits.maxCpuPercent!==undefined){
        if(resources.cpuMeasurementAvailable===false)reasons.push("CPU policy requires a known CPU measurement");
        if(requirements.maxCpuPercent===undefined||requirements.maxCpuPercent>limits.maxCpuPercent||resources.cpuUtilizationPercent>limits.maxCpuPercent)reasons.push("CPU usage or task CPU budget is missing or exceeds policy maximum");
      }
      if(limits.minBatteryPercent!==undefined&&(resources.batteryPercent===undefined||resources.batteryPercent<limits.minBatteryPercent))reasons.push("battery measurement is missing or below policy minimum");
      if(limits.wifiOnly&&resources.networkType!=="WIFI")reasons.push("Wi-Fi-only policy requires a confirmed Wi-Fi connection");
      if(limits.chargingOnly&&resources.isCharging!==true)reasons.push("charging-only policy requires confirmed charging");
      if(limits.thermalProtection&&(resources.thermalState!=="NORMAL"&&resources.thermalState!=="MODERATE"))reasons.push("thermal protection requires a safe measured thermal state");
      if(limits.allowBackground===false&&resources.lifecycleState!=="FOREGROUND")reasons.push("background policy requires confirmed foreground lifecycle");
    }
  }
  if(reasons.length)return{nodeId:node.id,eligible:false,score:null,reasons:[...new Set(reasons)]};
  const resources=node.resources!,cpuKnown=resources.cpuMeasurementAvailable!==false,memoryKnown=resources.memoryMeasurementAvailable!==false;
  const cpuHeadroom=cpuKnown?100-resources.cpuUtilizationPercent:50,memoryHeadroom=memoryKnown?100-resources.memoryUtilizationPercent:50;
  const coreCapacity=Math.min(node.profile.logicalCores,32)/32*100;
  const resourceScore=cpuHeadroom*.5+memoryHeadroom*.35+coreCapacity*.15;
  const measuredReliability=reliability&&Number.isInteger(reliability.sampleCount)&&reliability.sampleCount>0&&reliability.successRate!==null&&Number.isFinite(reliability.successRate)&&reliability.successRate>=0&&reliability.successRate<=1?reliability.successRate:null;
  const score=Number((measuredReliability===null?resourceScore:resourceScore*.95+measuredReliability*5).toFixed(3));
  const accepted=[cpuKnown?`CPU headroom ${cpuHeadroom.toFixed(1)}%`:"CPU measurement unavailable; neutral scoring estimate",memoryKnown?`memory headroom ${memoryHeadroom.toFixed(1)}%`:"memory measurement unavailable; neutral scoring estimate",`${node.profile.logicalCores} logical cores`,`${requirements.capability} capability satisfied`];
  if(resources.batteryPercent!==undefined)accepted.push(`battery ${resources.batteryPercent}%`);
  if(resources.isCharging!==undefined)accepted.push(resources.isCharging?"charging":"not charging");
  if(resources.networkType!==undefined)accepted.push(`network ${resources.networkType}`);
  if(resources.thermalState!==undefined)accepted.push(`thermal state ${resources.thermalState}`);
  if(measuredReliability!==null)accepted.push(`reliability ${(measuredReliability*100).toFixed(1)}% from ${reliability!.sampleCount} attributable sample(s)`);
  else accepted.push("reliability unknown; no attributable samples");
  return{nodeId:node.id,eligible:true,score,reasons:accepted};
}

export function selectNode(nodes:SchedulableNode[],requirements:TaskRequirements,context:SchedulingContext={}):SchedulingDecision{
  const frozenContext={...context,nowMs:context.nowMs??Date.now()},byId=new Map(nodes.map(node=>[node.id,node]));
  const evaluations=nodes.map(node=>evaluateNode(node,requirements,frozenContext));
  const histories=evaluations.filter(e=>e.eligible).map(e=>byId.get(e.nodeId)?.historicalPerformance?.[requirements.capability]).filter(validHistory);
  const fastest=histories.length?Math.min(...histories.map(history=>history.averageExecutionTimeMs)):null;
  for(const evaluation of evaluations){
    if(!evaluation.eligible||evaluation.score===null)continue;
    const history=byId.get(evaluation.nodeId)?.historicalPerformance?.[requirements.capability];
    if(validHistory(history)&&fastest!==null){
      evaluation.score=Number((evaluation.score*.75+fastest/history.averageExecutionTimeMs*20+history.successRate*5).toFixed(3));
      evaluation.reasons.push(`${history.sampleCount} historical sample(s)`,`${history.averageExecutionTimeMs.toFixed(2)} ms average`,`success ${(history.successRate*100).toFixed(1)}%`);
    }else evaluation.reasons.push("no historical samples; resource-only score");
  }
  const eligible=evaluations.filter((item):item is CandidateEvaluation&{score:number}=>item.eligible&&item.score!==null).sort((a,b)=>{
    if(requirements.executionMode==="HYBRID"){
      const localDifference=Number((byId.get(b.nodeId)?.executionLocation??"LOCAL")==="LOCAL")-Number((byId.get(a.nodeId)?.executionLocation??"LOCAL")==="LOCAL");
      if(localDifference)return localDifference;
    }
    return b.score-a.score||Number(b.nodeId===requirements.affinityNodeId)-Number(a.nodeId===requirements.affinityNodeId)||(a.nodeId<b.nodeId?-1:a.nodeId>b.nodeId?1:0);
  });
  const selected=eligible[0];
  if(!selected)return{selectedNodeId:null,score:null,explanation:`No eligible node satisfies ${requirements.capability} capability and resource requirements.`,evaluations};
  return{selectedNodeId:selected.nodeId,score:selected.score,explanation:`Selected ${selected.nodeId} with score ${selected.score}: ${selected.reasons.join("; ")}.`,evaluations};
}
