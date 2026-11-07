import type {ExecutionMode} from '@omnicompile/orchestration';

export type NetworkCandidate={networkId:string;score:number;local:boolean;cloud:boolean};

/** Choose a network before task creation; assignments remain scoped to that network. */
export function selectExecutionNetwork(candidates:NetworkCandidate[],mode?:ExecutionMode){
  const ranked=candidates.filter(candidate=>mode!=='HYBRID'||candidate.cloud);
  ranked.sort((a,b)=>(mode==='HYBRID'?Number(b.local)-Number(a.local)||Number(b.cloud)-Number(a.cloud):0)||b.score-a.score||a.networkId.localeCompare(b.networkId));
  return ranked[0]?.networkId??null;
}
