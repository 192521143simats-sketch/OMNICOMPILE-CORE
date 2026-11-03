import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {existsSync} from "node:fs";
import {join} from "node:path";
import type { CapabilityProfile, ResourceSnapshot } from "@omnicompile/contracts";

const execFileAsync=promisify(execFile);
let previous=os.cpus().map(cpu=>({...cpu.times}));

export type CpuTimes={user:number;nice:number;sys:number;idle:number;irq:number};
export type ToolchainProbe=(command:string,args:string[])=>Promise<{available:boolean;version?:string}>;

export async function probeToolchain(command:string,args:string[]){
  try{
    const {stdout,stderr}=await execFileAsync(command,args,{timeout:3_000,windowsHide:true});
    const version=`${stdout}\n${stderr}`.trim().split(/\r?\n/,1)[0]?.trim();
    return version?{available:true,version}:{available:true};
  }catch{return {available:false};}
}

export async function profile(probe:ToolchainProbe=probeToolchain):Promise<CapabilityProfile>{
  const cpus=os.cpus();
  const [c,python]=await Promise.all([probe(process.env.GCC_EXECUTABLE??"gcc",["--version"]),probe(process.env.PYTHON_EXECUTABLE??"python",["--version"])]);let java=await probe("javac",["-version"]);if(!java.available&&probe===probeToolchain){for(const home of [process.env.OMNICOMPILE_JDK_HOME,process.env.JAVA_HOME,"C:\\Program Files\\Java\\jdk-21.0.12.1"].filter(Boolean) as string[]){const executable=join(home,"bin",process.platform==="win32"?"javac.exe":"javac");if(existsSync(executable)){java=await probe(executable,["-version"]);if(java.available)break;}}}
  return {workerType:"NATIVE",deviceType:"DESKTOP",cpuModel:cpus[0]?.model??"Unknown CPU",logicalCores:Math.max(cpus.length,1),totalMemoryBytes:os.totalmem(),operatingSystem:`${os.type()} ${os.release()}`,architecture:os.arch(),runtimes:{c:c.available,python:python.available,java:java.available},toolchains:{c,python,java},operations:{irOptimization:true,staticAnalysis:true,browserCompute:true,nativeCompilation:true,nativeCSource:c.available}};
}

export function calculateCpuUtilization(before:CpuTimes[],after:CpuTimes[]){
  let idle=0,total=0;
  after.forEach((current,index)=>{const prior=before[index]??current;for(const key of Object.keys(current) as Array<keyof CpuTimes>)total+=Math.max(0,current[key]-prior[key]);idle+=Math.max(0,current.idle-prior.idle);});
  return total>0?Math.max(0,Math.min(100,(1-idle/total)*100)):0;
}

export function calculateMemoryUtilization(total:number,free:number){return total>0?Math.max(0,Math.min(100,((total-free)/total)*100)):0;}

export function resources():ResourceSnapshot{
  const current=os.cpus();
  const cpuUtilizationPercent=calculateCpuUtilization(previous,current.map(cpu=>cpu.times));
  previous=current.map(cpu=>({...cpu.times}));const free=os.freemem(),all=os.totalmem();
  return {cpuUtilizationPercent,cpuMeasurementAvailable:true,freeMemoryBytes:free,memoryUtilizationPercent:calculateMemoryUtilization(all,free),memoryMeasurementAvailable:true,observedAt:new Date().toISOString()};
}
