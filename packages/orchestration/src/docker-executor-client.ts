import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';

export type DockerJobRequest={kind:'verify'|'c_ir'|'task'|'execute';language:'c'|'python'|'java';payload:unknown};

function brokerRequest(path: '/jobs' | '/capabilities' | '/executions' | `/executions/${string}/cancel`){
  const configured=process.env.OMNICOMPILE_EXECUTOR_URL;
  if(!configured)throw new Error('The Docker execution service is not configured.');
  const url=new URL(path,configured);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Invalid Docker execution service URL.');
  const token=readFileSync(process.env.OMNICOMPILE_EXECUTOR_TOKEN_FILE??'/run/secrets/executor-token','utf8').trim();
  if(token.length<32)throw new Error('The Docker execution service credential is invalid.');
  return {url,authorization:`Bearer ${token}`};
}

async function readBrokerJson(response:Response,limit:number){
  const reader=response.body?.getReader();
  if(!reader)throw new Error('The Docker execution service returned no response.');
  const chunks:Uint8Array[]=[];let bytes=0;
  for(;;){
    const next=await reader.read();
    if(next.done)break;
    bytes+=next.value.byteLength;
    if(bytes>limit){await reader.cancel();throw new Error('The Docker execution result exceeded its size limit.');}
    chunks.push(next.value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function requestDockerCapabilities():Promise<unknown>{
  const {url,authorization}=brokerRequest('/capabilities');
  const response=await fetch(url,{headers:{authorization},signal:AbortSignal.timeout(8000),redirect:'error'});
  if(!response.ok){await response.body?.cancel();throw new Error('The Docker execution service capability check failed.');}
  return readBrokerJson(response,16_384);
}

export async function requestExecutionStatus(id?:string):Promise<{status:number;body:unknown}>{
  if(id&&!/^[0-9a-f-]{36}$/.test(id))throw new Error('Invalid execution ID.');
  const {url,authorization}=brokerRequest(id?`/executions/${id}/cancel`:'/executions');
  const response=await fetch(url,{method:id?'POST':'GET',headers:{authorization},signal:AbortSignal.timeout(8000),redirect:'error'});
  return {status:response.status,body:await readBrokerJson(response,65_536)};
}

/** Internal authenticated transport. Never falls back to host execution. */
export async function requestDockerJob<T>(job:DockerJobRequest,signal?:AbortSignal):Promise<T>{
  const {url,authorization}=brokerRequest('/jobs');
  const bounded=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(125_000)]);
  let response:Response;
  do{
    response=await fetch(url,{method:'POST',headers:{authorization,'content-type':'application/json'},body:JSON.stringify(job),signal:bounded,redirect:'error'});
    if(response.status===429){await response.body?.cancel();await delay(250,undefined,{signal:bounded});}
  }while(response.status===429);
  const body=await readBrokerJson(response,32_000_000);
  if(!response.ok)throw Object.assign(new Error(body.error?.message??'The Docker execution request failed.'),{diagnostics:body.error?.diagnostics});
  if(!Object.hasOwn(body,'result'))throw new Error('The Docker execution response is incomplete.');
  return body.result as T;
}
