import {runOwnedProcess} from '@omnicompile/orchestration';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
export async function runCompilerProcess<T>(payload:unknown,signal:AbortSignal):Promise<T>{
  const command=payload as {action?:string;source?:{language?:string}};
  const language=command.action==='c_ir'?'c':command.source?.language;
  const remote=language?process.env[`OMNICOMPILE_${language.toUpperCase()}_COMPILER_URL`]:undefined;
  if(remote){
    const url=new URL('/compile',remote);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Invalid compiler service endpoint');
    const token=readFileSync(process.env.OMNICOMPILE_COMPILER_TOKEN_FILE??'/run/secrets/compiler-token','utf8').trim();
    if(token.length<32)throw new Error('Compiler service secret is invalid');
    const transportSignal=AbortSignal.any([signal,AbortSignal.timeout(125_000)]);
    let response:Response;
    do{
      response=await fetch(url,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(payload),signal:transportSignal,redirect:'error'});
      if(response.status===429){
        await response.body?.cancel();
        await delay(250,undefined,{signal:transportSignal});
      }
    }while(response.status===429);
    const reader=response.body?.getReader();
    if(!reader)throw new Error('Compiler service returned no response');
    const chunks:Uint8Array[]=[];let size=0;
    for(;;){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>32_000_000){await reader.cancel();throw new Error('Compiler service response exceeded safety limit');}chunks.push(item.value);}
    const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!response.ok)throw Object.assign(new Error(result.error?.message??'Compiler service request failed'),{diagnostics:result.error?.diagnostics});
    return result.result as T;
  }
  const entry=new URL(import.meta.url.endsWith('.ts')?'./compiler-process.ts':'./compiler-process.js',import.meta.url);
  return (await runOwnedProcess<T>(entry,payload,{signal})).result;
}
