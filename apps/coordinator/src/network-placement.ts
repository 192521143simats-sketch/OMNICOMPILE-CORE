import type {ExecutionMode} from '@omnicompile/orchestration';

export type NetworkCandidate={networkId:string;score:number;local:boolean;cloud:boolean};

/** Choose a network before task creation; assignments remain scoped to that network. */
export function selectExecutionNetwork(candidates:NetworkCandidate[],mode?:ExecutionMode){
  const ranked=[...candidates];
  ranked.sort((a,b)=>b.score-a.score||(mode==='HYBRID'?Number(b.local)-Number(a.local)||Number(b.cloud)-Number(a.cloud):0)||a.networkId.localeCompare(b.networkId));
  return ranked[0]?.networkId??null;
}

/** Relative workload-capacity index, not a measured duration or benchmark. */
export function workloadCapacityScore(scores:number[],taskCount=1){
 if(!Number.isInteger(taskCount)||taskCount<1)throw new RangeError('Positive task count required');
 const usable=scores.filter(score=>Number.isFinite(score)&&score>=0);
 if(!usable.length)return null;
 const finish=usable.map(()=>0),cost=usable.map(score=>100/Math.max(score,.01));
 for(let task=0;task<taskCount;task++){
  let chosen=0;for(let index=1;index<finish.length;index++)if(finish[index]!+cost[index]!<finish[chosen]!+cost[chosen]!)chosen=index;
  finish[chosen]=finish[chosen]!+cost[chosen]!;
 }
 return 100/Math.max(...finish);
}
