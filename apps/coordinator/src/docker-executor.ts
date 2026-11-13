import Fastify, {type onRequestAsyncHookHandler} from 'fastify';
import {spawn} from 'node:child_process';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {KubernetesExecutionProvider,inClusterApi} from './kubernetes-execution.js';
import {Store} from './database.js';
import {dockerJobSchema,type DockerJob} from './docker-executor-schema.js';

type CommandResult={code:number;stdout:string};
type Command=(args:string[],input?:string,signal?:AbortSignal)=>Promise<CommandResult>;
type ToolchainImages = Record<DockerJob['language'], string>;
const localToolchainImages: ToolchainImages = {
  c: 'omnicompile-c-worker:local',
  python: 'omnicompile-python-worker:local',
  java: 'omnicompile-java-worker:local',
};

export function resolveToolchainImages(env: NodeJS.ProcessEnv = process.env): ToolchainImages {
  const c = env.OMNICOMPILE_EXECUTOR_IMAGE_C;
  const python = env.OMNICOMPILE_EXECUTOR_IMAGE_PYTHON;
  const java = env.OMNICOMPILE_EXECUTOR_IMAGE_JAVA;
  if (c === undefined && python === undefined && java === undefined) return localToolchainImages;

  // The operator configures all language images together. Requests cannot select
  // an image, and release deployments cannot fall back to a mutable local tag.
  const pinnedReference = /^[a-z0-9][a-z0-9._:/-]*@sha256:[a-f0-9]{64}$/;
  if (!c || !python || !java || ![c, python, java].every(image => pinnedReference.test(image))) {
    throw new Error('Configure immutable SHA-256 image references for all three execution toolchains.');
  }
  return {c, python, java};
}

export const dockerCommand:Command=(args,input,signal)=>new Promise((resolve,reject)=>{
  signal?.throwIfAborted();
  const child=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let size=0,settled=false;const chunks:Buffer[]=[];
  const finish=(error?:Error,code=-1)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);error?reject(error):resolve({code,stdout:Buffer.concat(chunks).toString('utf8')});};
  const cancel=()=>{child.kill();finish(new DOMException('Docker job cancelled','AbortError'));};
  const timer=setTimeout(()=>{child.kill();finish(new Error('Docker job command timed out.'));},120_000);
  signal?.addEventListener('abort',cancel,{once:true});
  child.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>32_000_000){child.kill();finish(new Error('Docker job output exceeded its size limit.'));}else chunks.push(chunk);});
  // Daemon errors may contain host paths. They are never returned to a client.
  child.stderr.on('data',()=>{});
  child.stdin.on('error',()=>{});
  child.once('error',()=>finish(new Error('The Docker execution engine is unavailable.')));
  child.once('close',code=>finish(undefined,code??-1));
  child.stdin.end(input);
});

export async function runDockerJob(job:DockerJob,signal:AbortSignal,command:Command=dockerCommand,images:ToolchainImages=localToolchainImages){
  const owner=randomUUID(),name=`omnicompile-job-${owner}`;
  let created=false;
  try{
    const create=await command(['create','--pull','never','--name',name,'--label',`omnicompile.execution.owner=${owner}`,
      '--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--user','1000:1000',
      '--memory','512m','--memory-swap','512m','--cpus','1','--pids-limit','64','--ulimit','nofile=128:128',
      '--init','--interactive','--tmpfs','/tmp:rw,exec,nosuid,nodev,size=128m,mode=1777',
      images[job.language],'node','--import','tsx','apps/coordinator/src/compiler-job.ts'],undefined,signal);
    if(create.code!==0)throw new Error('The isolated language image could not be started.');
    created=true;
    const executed=await command(['start','--attach','--interactive',name],JSON.stringify(job),signal);
    if(executed.code!==0)throw new Error('The isolated job failed or exhausted its resource limit.');
    const value=JSON.parse(executed.stdout);
    if(value.ok!==true)throw Object.assign(new Error(typeof value.error?.message==='string'?value.error.message:'The isolated compiler job failed.'),{diagnostics:value.error?.diagnostics});
    return value.result;
  }finally{
    const ownership=await command(['inspect','--format','{{index .Config.Labels "omnicompile.execution.owner"}}',name]);
    if(ownership.code===0){
      if(ownership.stdout.trim()!==owner)throw new Error('Isolated job ownership could not be confirmed during cleanup.');
      const removed=await command(['rm','--force',name]);
      if(removed.code!==0)throw new Error('The isolated job could not be removed; operator inspection is required.');
    }else if(created)throw new Error('The isolated job could not be inspected during cleanup.');
  }
}

type Run=(job:DockerJob,signal:AbortSignal)=>Promise<unknown>;
export function createDockerExecutor(
  token: string,
  run?: Run,
  {images = localToolchainImages, command = dockerCommand, kubernetes}: {images?: ToolchainImages; command?: Command; kubernetes?: KubernetesExecutionProvider} = {}
) {
  const execute: Run = run ?? ((job, signal) => runDockerJob(job, signal, command, images));
  if(token.length<32)throw new Error('The execution service requires a scoped credential.');
  const app=Fastify({bodyLimit:24_000_000,logger:false});
  const active=new Set<AbortController>();
  const expected = Buffer.from(`Bearer ${token}`);
  const authenticate: onRequestAsyncHookHandler = async (request, reply) => {
    const supplied = Buffer.from(request.headers.authorization ?? '');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return reply.code(401).send({error:{code:'EXECUTOR_AUTH_REQUIRED',message:'Execution service authentication is required.'}});
    }
  };
  const inspectImages = (references: string[], signal?: AbortSignal) =>
    command(['image', 'inspect', '--format', '{{.Id}}', ...references], undefined, signal).catch(() => null);
  app.get('/ready',async(_request,reply)=>{
    if(kubernetes){
      try{await kubernetes.ready();return {status:'ready',service:'omnicompile-executor'};}
      catch{return reply.code(503).send({status:'unavailable',service:'omnicompile-executor'});}
    }
    const inspected=await inspectImages(Object.values(images));
    if(!inspected||inspected.code!==0)return reply.code(503).send({status:'unavailable',service:'omnicompile-executor'});
    return {status:'ready',service:'omnicompile-executor'};
  });
  const inspectToolchains = async () => {
    const signal = AbortSignal.timeout(5000);
    return Promise.all((['c', 'python', 'java'] as const).map(async language => {
      const reference = images[language];
      const inspected = await inspectImages([reference], signal);
      const id = inspected?.code === 0 ? inspected.stdout.trim() : '';
      const imageId = /^sha256:[0-9a-f]{64}$/.test(id) ? id : null;
      return {language, reference, available: imageId !== null, imageId};
    }));
  };
  let capabilityInspection: ReturnType<typeof inspectToolchains> | undefined;
  app.get('/capabilities', {onRequest: authenticate}, async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if(kubernetes)return {provider:'kubernetes',toolchains:Object.entries(images).map(([language,reference])=>({language,reference,available:null,imageId:null}))};
    capabilityInspection ??= inspectToolchains().finally(() => { capabilityInspection = undefined; });
    return {provider: 'docker', toolchains: await capabilityInspection};
  });
  app.get('/executions',{onRequest:authenticate},async(_request,reply)=>{
    reply.header('Cache-Control','no-store');
    return {provider:kubernetes?'kubernetes':'docker',items:kubernetes?await kubernetes.list():[]};
  });
  app.post('/executions/:id/cancel',{onRequest:authenticate},async(request,reply)=>{
    const id=(request.params as {id:string}).id;
    if(!kubernetes||!/^[0-9a-f-]{36}$/.test(id)||!await kubernetes.cancel(id))return reply.code(409).send({error:{code:'EXECUTION_NOT_ACTIVE',message:'This execution cannot be cancelled.'}});
    return reply.code(202).send({status:'CANCEL_REQUESTED'});
  });
  app.post('/jobs',{onRequest:authenticate},async(request,reply)=>{
    const parsed=dockerJobSchema.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:{code:'INVALID_EXECUTOR_JOB',message:'The isolated job request is invalid.'}});
    if(active.size>=2)return reply.code(429).send({error:{code:'EXECUTOR_BUSY',message:'The execution service is at capacity.'}});
    const abort=new AbortController();active.add(abort);
    const timer=setTimeout(()=>abort.abort(),120_000);
    const disconnected=()=>{if(!reply.raw.writableEnded)abort.abort();};reply.raw.once('close',disconnected);
    try{return {result:await (kubernetes?kubernetes.run(parsed.data,abort.signal):execute(parsed.data,abort.signal))};}
    catch(cause){const error=cause as Error&{diagnostics?:unknown};return reply.code((error as {statusCode?:number}).statusCode===429?429:422).send({error:{code:'ISOLATED_JOB_FAILED',message:error.message,diagnostics:error.diagnostics}});}
    finally{clearTimeout(timer);reply.raw.off('close',disconnected);active.delete(abort);}
  });
  app.addHook('preClose',async()=>{for(const controller of active)controller.abort();});
  return app;
}

async function main(){
  const token=readFileSync(process.env.OMNICOMPILE_EXECUTOR_TOKEN_FILE??'/run/secrets/executor-token','utf8').trim();
  const images=resolveToolchainImages();
  const provider=process.env.OMNICOMPILE_EXECUTION_PROVIDER??'docker';
  if(!['docker','kubernetes'].includes(provider))throw new Error('Invalid execution provider.');
  const api=provider==='kubernetes'?inClusterApi():undefined;
  const store=api?await Store.connect({host:process.env.DB_HOST!,port:Number(process.env.DB_PORT??3306),
    name:process.env.DB_NAME!,user:process.env.DB_USER!,password:process.env.DB_PASSWORD!}):undefined;
  const kubernetes=store&&api?new KubernetesExecutionProvider(store.pool,api,
    process.env.OMNICOMPILE_EXECUTION_NAMESPACE??'omnicompile-execution',
    process.env.OMNICOMPILE_SANDBOX_RUNTIME_CLASS??'',images):undefined;
  const app=createDockerExecutor(token,undefined,{images,...(kubernetes?{kubernetes}:{})});
  if(kubernetes){
    const timer=setInterval(()=>void kubernetes.reconcile().catch(()=>console.error('Execution reconciliation failed.')),5000);
    timer.unref();
    app.addHook('onClose',async()=>{clearInterval(timer);await store?.close();});
  }
  await app.listen({host:'0.0.0.0',port:4102});
  for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void app.close();});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)void main().catch(()=>{console.error('Execution service initialization failed.');process.exit(1);});
