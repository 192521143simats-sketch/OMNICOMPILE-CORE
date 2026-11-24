import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';

export type DockerJobRequest={kind:'verify'|'c_ir'|'python_plan'|'python_aggregate'|'java_plan'|'java_aggregate'|'task'|'execute';language:'c'|'python'|'java';payload:unknown};
const executionRequestIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function brokerRequest(path: '/jobs' | '/capabilities' | '/executions' | `/executions/${string}/cancel` | `/execution-receipts/${string}/ack`){
  const configured=process.env.OMNICOMPILE_EXECUTOR_URL;
  if(!configured)throw new Error('The Docker execution service is not configured.');
  const url=new URL(path,configured);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Invalid Docker execution service URL.');
  const token=readFileSync(process.env.OMNICOMPILE_EXECUTOR_TOKEN_FILE??'/run/secrets/executor-token','utf8').trim();
  if(token.length<32)throw new Error('The Docker execution service credential is invalid.');
  return {url,authorization:`Bearer ${token}`};
}

/** Call only after the accepted result and any required artifacts are committed. */
export async function acknowledgeExecutionReceipt(requestId:string):Promise<void>{
  if(!executionRequestIdPattern.test(requestId))throw new Error('Invalid execution request ID.');
  const {url,authorization}=brokerRequest(`/execution-receipts/${requestId}/ack`);
  const response=await fetch(url,{method:'POST',headers:{authorization},signal:AbortSignal.timeout(8000),redirect:'error'});
  if(response.status===204)return;
  const body=await readBrokerJson(response,16_384);
  throw Object.assign(new Error(body.error?.message??'Execution receipt acknowledgement failed.'),{
    statusCode:response.status,
    code:body.error?.code
  });
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
export async function requestDockerJob<T>(job:DockerJobRequest,signal?:AbortSignal,requestId?:string):Promise<T>{
  if(requestId!==undefined&&!executionRequestIdPattern.test(requestId))throw new Error('Invalid execution request ID.');
  const {url,authorization}=brokerRequest('/jobs');
  const bounded=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(125_000)]);
  let response:Response;
  let capacityRetryStarted:number|undefined;
  let retryCeilingMs=500;
  const bodyText=JSON.stringify(job);
  do{
    const headers:Record<string,string>={authorization,'content-type':'application/json','x-omnicompile-capacity-retry-wait-ms':'0'};
    if(requestId!==undefined)headers['x-omnicompile-execution-request-id']=requestId;
    // Caller-observed retry delay, never broker queue or execution time.
    if(capacityRetryStarted!==undefined)headers['x-omnicompile-capacity-retry-wait-ms']=String(Math.min(125_000,Math.max(0,Math.floor(performance.now()-capacityRetryStarted))));
    response=await fetch(url,{method:'POST',headers,body:bodyText,signal:bounded,redirect:'error'});
    if(response.status===429){
      capacityRetryStarted??=performance.now();
      await response.body?.cancel();
      // Spread retries from clients that reached capacity at the same time.
      const retryDelayMs=Math.floor(retryCeilingMs*(0.5+Math.random()*0.5));
      await delay(retryDelayMs,undefined,{signal:bounded});
      retryCeilingMs=Math.min(2000,retryCeilingMs*2);
    }
  }while(response.status===429);
  const body=await readBrokerJson(response,32_000_000);
  if(!response.ok)throw Object.assign(new Error(body.error?.message??'The Docker execution request failed.'),{
    statusCode:response.status,
    code:body.error?.code,
    diagnostics:body.error?.diagnostics
  });
  if(!Object.hasOwn(body,'result'))throw new Error('The Docker execution response is incomplete.');
  return body.result as T;
}
