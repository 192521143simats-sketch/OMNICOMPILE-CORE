import type {WorkPayload} from '@omnicompile/contracts';
import {runOwnedProcess} from '@omnicompile/orchestration';
export {TaskTerminationUnconfirmedError} from '@omnicompile/orchestration';
export function runTaskProcess(payload:WorkPayload,options:{signal?:AbortSignal;onStarted?:()=>void}={}){
  return runOwnedProcess<unknown>(new URL(import.meta.url.endsWith('.ts')?'./task-process.ts':'./task-process.js',import.meta.url),payload,options);
}
