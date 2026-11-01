import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import type {StoredArtifact} from "./database.js";
import type {ExecutionEvidence} from "./execution-evidence.js";
import {decodeCompilerOutput} from "./compiler-artifacts.js";
import {runKubernetesExecution} from './kubernetes-execution.js';

type Input={language:"c"|"python"|"java";sourceName:string;generatedSource:string;artifact:StoredArtifact|null;runnableJar?:boolean;input?:string;signal?:AbortSignal|undefined};
const evidenceSchema=z.object({status:z.enum(["SUCCEEDED","FAILED","TIMED_OUT","OUTPUT_LIMIT","UNAVAILABLE","NOT_RUN"]),stdout:z.string().max(65536),stderr:z.string().max(65536),exitCode:z.number().int().nullable(),durationMs:z.number().nonnegative().max(60000).nullable(),peakMemoryBytes:z.number().nonnegative().max(536870912).nullable(),target:z.literal("Linux container"),artifactName:z.string().max(255).nullable(),input:z.string().max(16384),message:z.string().max(1000)});
function command(args:string[],input?:string,timeout=40000,signal?:AbortSignal):Promise<{code:number;output:string}>{return new Promise((resolve,reject)=>{const child=spawn("docker",args,{windowsHide:true,stdio:["pipe","pipe","pipe"]});let output="",errors="",settled=false;const finish=(error?:Error,code=-1)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener("abort",cancel);error?reject(error):resolve({code,output});};const cancel=()=>{child.kill();finish(new DOMException("Execution cancelled","AbortError"));};const timer=setTimeout(()=>{child.kill();finish(new Error("Sandbox command timed out"));},timeout);signal?.addEventListener("abort",cancel,{once:true});if(signal?.aborted)cancel();child.stdout.on("data",chunk=>{output+=chunk.toString();if(Buffer.byteLength(output)>12000000){child.kill();finish(new Error("Sandbox result exceeds its bound"));}});child.stderr.on("data",chunk=>{errors+=chunk.toString();if(errors.length>65536){child.kill();finish(new Error("Sandbox diagnostics exceed their bound"));}});child.stdin.on("error",()=>{});child.on("error",()=>finish(new Error("Docker executable is unavailable")));child.on("close",code=>finish(undefined,code??-1));child.stdin.end(input);});}
let active=0;const waiters:Array<()=>void>=[];
async function acquire():Promise<boolean>{if(active<2){active++;return true;}if(waiters.length>=8)return false;return new Promise<boolean>(resolve=>{const admit=()=>{clearTimeout(timer);resolve(true);};const timer=setTimeout(()=>{const index=waiters.indexOf(admit);if(index>=0)waiters.splice(index,1);resolve(false);},30000);waiters.push(admit);});}
function release(){const next=waiters.shift();if(next)next();else active--;}
export async function executeIsolated(input:Input):Promise<{execution:ExecutionEvidence;artifact?:StoredArtifact}>{
  const unavailable=(message:string,status:ExecutionEvidence["status"]="UNAVAILABLE"):ExecutionEvidence=>({status,stdout:"",stderr:"",exitCode:null,durationMs:null,peakMemoryBytes:null,target:"Linux container",artifactName:null,input:input.input??"",message});
  if(input.language==="java"&&input.runnableJar===false)return{execution:unavailable("This Java library has no runnable entry point; execution was not performed.","NOT_RUN")};
  if(Buffer.byteLength(input.generatedSource)>1000000||Buffer.byteLength(input.input??"")>16384||! /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(input.sourceName))throw new Error("Invalid execution input");
  const image=process.env.GRID_X_SANDBOX_IMAGE??"gridx-execution:1";if(!/^[A-Za-z0-9][A-Za-z0-9./:@_-]*$/.test(image))throw new Error("Invalid sandbox image configuration");
  const name=`gridx-execution-${randomUUID()}`,owner=randomUUID();let created=false;if(!await acquire())return{execution:unavailable("Execution capacity is currently exhausted; compiled artifacts are preserved. Retry execution later.")};
  try{
    input.signal?.throwIfAborted();
    const kubernetes=process.env.GRID_X_EXECUTION_MODE==='kubernetes';
    if(!kubernetes){
    const create=await command(["create","--pull","never","--name",name,"--label",`gridx.execution.owner=${owner}`,"--network","none","--read-only","--cap-drop","ALL","--cap-add","SETUID","--cap-add","SETGID","--cap-add","CHOWN","--cap-add","KILL","--security-opt","no-new-privileges","--user","0:0","--memory","512m","--memory-swap","512m","--cpus","1","--pids-limit","64","--ulimit","nofile=128:128","--init","--interactive","--tmpfs","/work:rw,exec,nosuid,nodev,size=64m,mode=1777","--tmpfs","/tmp:rw,nosuid,nodev,noexec,size=32m,mode=1777",image]);
    if(create.code!==0)return{execution:unavailable("Docker or the OmniCompile Core execution image is unavailable. Build the execution image and retry; compilation artifacts are preserved.")};created=true;
    }
    const payload=JSON.stringify({language:input.language,sourceName:input.sourceName,generatedSource:input.generatedSource,input:input.input??"",artifactName:input.artifact?.fileName,artifactBase64:input.artifact?.bytes.toString("base64")});
    const run=kubernetes?{code:0,output:await runKubernetesExecution(payload,image,input.signal)}:await command(["start","--attach","--interactive",name],payload,40000,input.signal);
    if(run.code!==0)return{execution:unavailable("The isolated execution environment failed or exhausted its resource limit; program success was not established.")};
    const value=JSON.parse(run.output),execution=evidenceSchema.parse(value.execution);
    // Strip sandbox-internal paths while preserving line numbers and actual errors.
    execution.stderr=execution.stderr.replaceAll("/work/program.py",input.artifact?.fileName??`compiled_${input.sourceName}`).replaceAll("/work/program.c",input.sourceName).replaceAll("/work/program.jar",input.artifact?.fileName??input.sourceName);
    if(input.language==="python")execution.artifactName=input.artifact?.fileName??`compiled_${input.sourceName}`;
    if(!value.artifact)return{execution};
    const artifact=z.object({fileName:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,125}$/),contentBase64:z.string().max(11000000)}).parse(value.artifact),bytes=decodeCompilerOutput(artifact.contentBase64,11000000);if(bytes.length>8000000||!bytes.subarray(0,4).equals(Buffer.from([127,69,76,70])))throw new Error("Invalid Linux output");
    return{execution,artifact:{artifactType:"EXECUTABLE",fileName:artifact.fileName,mediaType:"application/octet-stream",bytes}};
  }catch{return{execution:unavailable("Isolated execution did not produce valid evidence. Compilation artifacts are preserved; no execution success is claimed.")};}
  finally{try{const label=process.env.GRID_X_EXECUTION_MODE==='kubernetes'?null:await command(["inspect","--format",'{{ index .Config.Labels "gridx.execution.owner" }}',name],undefined,10000).catch(()=>null);if(label?.output.trim()===owner){let removed=false;for(let attempt=0;attempt<2&&!removed;attempt++){const result=await command(["rm","--force",name],undefined,10000).catch(()=>null);removed=result?.code===0;}if(!removed)console.error("Owned OmniCompile Core execution container cleanup failed; operator inspection is required.");}else if(created)console.error("OmniCompile Core execution container ownership could not be verified; refusing unsafe cleanup.");}finally{release();}}
}
