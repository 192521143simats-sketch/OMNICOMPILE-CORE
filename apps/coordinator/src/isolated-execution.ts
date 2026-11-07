import {z} from 'zod';
import type {StoredArtifact} from './database.js';
import type {ExecutionEvidence} from './execution-evidence.js';
import {decodeCompilerOutput} from './compiler-artifacts.js';
import {requestDockerJob} from '@omnicompile/orchestration';

type Input={language:'c'|'python'|'java';sourceName:string;generatedSource:string;artifact:StoredArtifact|null;runnableJar?:boolean;input?:string;signal?:AbortSignal|undefined};
const evidenceSchema=z.object({status:z.enum(['SUCCEEDED','FAILED','TIMED_OUT','OUTPUT_LIMIT','UNAVAILABLE','NOT_RUN']),stdout:z.string().max(65536),stderr:z.string().max(65536),exitCode:z.number().int().nullable(),durationMs:z.number().nonnegative().max(60000).nullable(),peakMemoryBytes:z.number().nonnegative().max(536870912).nullable(),target:z.literal('Linux container'),artifactName:z.string().max(255).nullable(),input:z.string().max(16384),message:z.string().max(1000)});
let active=0;
const waiters:Array<()=>void>=[];
async function acquire():Promise<boolean>{
  if(active<2){active++;return true;}
  if(waiters.length>=8)return false;
  return new Promise<boolean>(resolve=>{
    const admit=()=>{clearTimeout(timer);resolve(true);};
    const timer=setTimeout(()=>{const index=waiters.indexOf(admit);if(index>=0)waiters.splice(index,1);resolve(false);},30000);
    waiters.push(admit);
  });
}
function release(){const next=waiters.shift();if(next)next();else active--;}

/** Submitted programs run only through the scoped Docker execution broker. */
export async function executeIsolated(input:Input):Promise<{execution:ExecutionEvidence;artifact?:StoredArtifact}>{
  const unavailable=(message:string,status:ExecutionEvidence['status']='UNAVAILABLE'):ExecutionEvidence=>({status,stdout:'',stderr:'',exitCode:null,durationMs:null,peakMemoryBytes:null,target:'Linux container',artifactName:null,input:input.input??'',message});
  if(input.language==='java'&&input.runnableJar===false)return {execution:unavailable('This Java library has no runnable entry point; execution was not performed.','NOT_RUN')};
  if(Buffer.byteLength(input.generatedSource)>1_000_000||Buffer.byteLength(input.input??'')>16384||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(input.sourceName))throw new Error('Invalid execution input');
  if(!process.env.OMNICOMPILE_EXECUTOR_URL)return {execution:unavailable('The Docker execution broker is not configured. Compilation artifacts are preserved.')};
  if(!await acquire())return {execution:unavailable('Execution capacity is currently exhausted; compiled artifacts are preserved. Retry execution later.')};
  try{
    input.signal?.throwIfAborted();
    const payload={language:input.language,sourceName:input.sourceName,generatedSource:input.generatedSource,input:input.input??'',artifactName:input.artifact?.fileName,artifactBase64:input.artifact?.bytes.toString('base64')};
    const value=await requestDockerJob<{execution:unknown;artifact?:unknown}>({kind:'execute',language:input.language,payload},input.signal);
    const execution=evidenceSchema.parse(value.execution);
    const pythonFile=input.artifact?.fileName??`compiled_${input.sourceName}`;
    execution.stderr=execution.stderr.replaceAll('/work/program.py',pythonFile).replaceAll('"program.py"',`"${pythonFile}"`).replaceAll('/work/program.c',input.sourceName).replaceAll('/work/program.jar',input.artifact?.fileName??input.sourceName);
    if(input.language==='python')execution.artifactName=pythonFile;
    if(!value.artifact)return {execution};
    const artifact=z.object({fileName:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,125}$/),contentBase64:z.string().max(11_000_000)}).parse(value.artifact);
    const bytes=decodeCompilerOutput(artifact.contentBase64,11_000_000);
    if(bytes.length>8_000_000||!bytes.subarray(0,4).equals(Buffer.from([127,69,76,70])))throw new Error('Invalid Linux output');
    return {execution,artifact:{artifactType:'EXECUTABLE',fileName:artifact.fileName,mediaType:'application/octet-stream',bytes}};
  }catch{
    return {execution:unavailable('Isolated execution did not produce valid evidence. Compilation artifacts are preserved; no execution success is claimed.')};
  }finally{release();}
}
