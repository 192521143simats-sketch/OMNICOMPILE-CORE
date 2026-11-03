import {optimizeCIR,type IRFunction} from "@omnicompile/compiler-c/browser";
import {sha256} from "@noble/hashes/sha256";
import {executeDeterministicPortable,workPayloadSchema,portableWorkloadCatalogue} from "@omnicompile/contracts";

type Task={taskId:string;attempt:number;payload:any};
const hex=(bytes:Uint8Array)=>[...bytes].map(value=>value.toString(16).padStart(2,"0")).join("");

self.onmessage=async(event:MessageEvent<Task>)=>{
  const{taskId,attempt}=event.data,started=performance.now();
  try{
    const payload=workPayloadSchema.parse(event.data.payload);
    if(payload.operation.endsWith("_compile"))throw new Error("This task requires a native worker capability.");
    const deadline=started+(payload.operation in portableWorkloadCatalogue?portableWorkloadCatalogue[payload.operation as keyof typeof portableWorkloadCatalogue].executionLimit.maxDurationMs:30000);
    let lastProgress=-1;
    const checkpoint=async(percent:number)=>{if(performance.now()>deadline)throw new Error("Browser execution time limit exceeded.");const progress=Math.min(99,Math.floor(percent));if(progress>lastProgress){lastProgress=progress;self.postMessage({type:"progress",taskId,attempt,percent:progress});}await new Promise(resolve=>setTimeout(resolve,0));if(performance.now()>deadline)throw new Error("Browser execution time limit exceeded.");};
    let result:unknown;
    if(payload.operation==="sha256"){const bytes=new TextEncoder().encode(payload.input);result={operation:"sha256",digest:hex(sha256(bytes)),inputBytes:bytes.byteLength};}
    else if(payload.operation==="sha256_chain"){let value:Uint8Array=new TextEncoder().encode(payload.input);for(let index=0;index<payload.iterations;index++){value=sha256(value);if((index+1)%512===0)await checkpoint((index+1)/payload.iterations*100);}result={operation:"sha256_chain",iterations:payload.iterations,digest:hex(value)};}
    else if(payload.operation==="prime_count"){const composite=new Uint8Array(payload.limit+1);let count=0;for(let number=2;number<=payload.limit;number++){if(!composite[number]){count++;if(number*number<=payload.limit)for(let multiple=number*number;multiple<=payload.limit;multiple+=number)composite[multiple]=1;}if(number%65536===0)await checkpoint(number/payload.limit*100);}result={operation:"prime_count",limit:payload.limit,count};}
    else if(payload.operation==="matrix_multiply"||payload.operation==="portable_benchmark"){let chunks=0;result=await executeDeterministicPortable(payload,()=>checkpoint(payload.operation==="matrix_multiply"?++chunks/payload.left.length*100:Math.min(++chunks*4096,payload.iterations)/payload.iterations*100));}
    else if(payload.operation==="c_optimize_ir"){const optimized=optimizeCIR({kind:"OmniCompileCIR",version:1,functions:[payload.function as IRFunction]});result={operation:"c_optimize_ir",function:optimized.ir.functions[0],report:optimized.report};}
    else throw new Error("This task requires a native worker capability.");
    if(performance.now()>deadline)throw new Error("Browser execution time limit exceeded.");
    self.postMessage({type:"completed",taskId,attempt,result,executionTimeMs:performance.now()-started});
  }catch(cause){self.postMessage({type:"failed",taskId,attempt,error:cause instanceof Error?cause.message:"Browser task failed"});}
};
