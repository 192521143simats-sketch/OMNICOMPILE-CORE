import Fastify from 'fastify';
import {z} from 'zod';
import {timingSafeEqual} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {cIrFunctionSchema} from '@omnicompile/contracts';
import {runOwnedProcess} from '@omnicompile/orchestration';

const languageSchema=z.enum(['c','python','java']);
const filename=z.string().min(1).max(255).regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
const source=z.object({language:languageSchema,sourceName:filename,sourceText:z.string().min(1).max(1_000_000)}).strict();
const payloadSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('verify'),source,worker:z.record(z.string(),z.unknown())}).strict(),
  z.object({action:z.literal('c_ir'),source:z.string().min(1).max(1_000_000),sourceName:filename,base:filename,ir:z.object({kind:z.literal('OmniCompileCIR'),version:z.literal(1),functions:z.array(cIrFunctionSchema).max(1000)})}).strict()
]);
type Execute=(payload:unknown,signal:AbortSignal)=>Promise<unknown>;

export function createCompilerService(language:z.infer<typeof languageSchema>,token:string,execute?:Execute){
  if(token.length<32)throw new Error('Compiler service requires a scoped secret of at least 32 characters');
  const app=Fastify({bodyLimit:20_000_000,logger:false});
  let busy=false;
  const run=execute??(async(payload,signal)=>{
    const entry=new URL(import.meta.url.endsWith('.ts')?'./compiler-process.ts':'./compiler-process.js',import.meta.url);
    return (await runOwnedProcess(entry,payload,{signal})).result;
  });
  app.get('/ready',async()=>({status:'ready',language}));
  app.post('/compile',async(request,reply)=>{
    const supplied=Buffer.from(request.headers.authorization??'');
    const expected=Buffer.from(`Bearer ${token}`);
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return reply.code(401).send({error:{code:'COMPILER_AUTH_REQUIRED'}});
    const parsed=payloadSchema.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:{code:'INVALID_COMPILER_REQUEST'}});
    const payload=parsed.data;
    const requested=payload.action==='c_ir'?'c':payload.source.language;
    if(requested!==language)return reply.code(422).send({error:{code:'COMPILER_LANGUAGE_MISMATCH'}});
    if(busy)return reply.code(429).send({error:{code:'COMPILER_BUSY'}});
    busy=true;
    const abort=new AbortController();
    const timer=setTimeout(()=>abort.abort(),120_000);
    const disconnected=()=>{if(!reply.raw.writableEnded)abort.abort();};
    reply.raw.once('close',disconnected);
    try{return {result:await run(payload,abort.signal)};}
    catch(error){const failure=error as Error&{diagnostics?:unknown};return reply.code(422).send({error:{code:'COMPILATION_FAILED',message:failure.message,diagnostics:failure.diagnostics}});}
    finally{clearTimeout(timer);reply.raw.off('close',disconnected);busy=false;}
  });
  return app;
}

async function main(){
  const language=languageSchema.parse(process.env.OMNICOMPILE_WORKER_LANGUAGE);
  const token=readFileSync(process.env.OMNICOMPILE_COMPILER_TOKEN_FILE??'/run/secrets/compiler-token','utf8').trim();
  const app=createCompilerService(language,token);
  await app.listen({host:'0.0.0.0',port:4101});
  const credentialFile=process.env.WORKER_CREDENTIAL_FILE;
  if(credentialFile&&existsSync(credentialFile)&&readFileSync(credentialFile,'utf8').trim()){
    // The worker keeps its existing enrollment, capability, heartbeat and task protocol.
    const workerEntry=new URL(import.meta.url.endsWith('.ts')?'../../worker/src/cloud.ts':'../../worker/dist/cloud.js',import.meta.url);
    await import(workerEntry.href);
  }
  for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void app.close();});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)void main().catch(()=>{console.error('Compiler service initialization failed');process.exit(1);});
