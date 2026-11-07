import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';

export type DockerJobRequest={kind:'verify'|'c_ir'|'task'|'execute';language:'c'|'python'|'java';payload:unknown};

/** Internal authenticated transport. Never falls back to host execution. */
export async function requestDockerJob<T>(job:DockerJobRequest,signal?:AbortSignal):Promise<T>{
  const configured=process.env.OMNICOMPILE_EXECUTOR_URL;
  if(!configured)throw new Error('The Docker execution service is not configured.');
  const url=new URL('/jobs',configured);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Invalid Docker execution service URL.');
  const token=readFileSync(process.env.OMNICOMPILE_EXECUTOR_TOKEN_FILE??'/run/secrets/executor-token','utf8').trim();
  if(token.length<32)throw new Error('The Docker execution service credential is invalid.');
  const bounded=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(125_000)]);
  let response:Response;
  do{
    response=await fetch(url,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(job),signal:bounded,redirect:'error'});
    if(response.status===429){await response.body?.cancel();await delay(250,undefined,{signal:bounded});}
  }while(response.status===429);
  const reader=response.body?.getReader();
  if(!reader)throw new Error('The Docker execution service returned no response.');
  const chunks:Uint8Array[]=[];let bytes=0;
  for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>32_000_000){await reader.cancel();throw new Error('The Docker execution result exceeded its size limit.');}chunks.push(next.value);}
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!response.ok)throw Object.assign(new Error(body.error?.message??'The Docker execution request failed.'),{diagnostics:body.error?.diagnostics});
  if(!Object.hasOwn(body,'result'))throw new Error('The Docker execution response is incomplete.');
  return body.result as T;
}
