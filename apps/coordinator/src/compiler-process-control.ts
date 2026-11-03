import {runOwnedProcess} from '@omnicompile/orchestration';
export async function runCompilerProcess<T>(payload:unknown,signal:AbortSignal):Promise<T>{
  const entry=new URL(import.meta.url.endsWith('.ts')?'./compiler-process.ts':'./compiler-process.js',import.meta.url);
  return (await runOwnedProcess<T>(entry,payload,{signal})).result;
}
