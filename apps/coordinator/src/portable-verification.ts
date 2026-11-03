import {createHash} from "node:crypto";
import {setImmediate as yieldToIO} from "node:timers/promises";
import {performance} from "node:perf_hooks";
import {testTaskSchema,portableResultSchema,portableWorkloadCatalogue} from "@omnicompile/contracts";
import {z} from "zod";

const resultSchema=portableResultSchema;

export class ResultVerificationError extends Error {
  readonly code="RESULT_VERIFICATION_FAILED";
}
export class StaleTaskResultError extends Error {
  readonly code="STALE_TASK_RESULT";
  constructor(){super("The task result no longer belongs to an active authorized attempt.");}
}

// Uses coordinator-known inputs and Node's crypto implementation, never a
// worker's claimed digest/verification flag. Cooperative chunks keep I/O alive.
export async function verifyPortableResult(payload:unknown,result:unknown,signal?:AbortSignal){
  const input=testTaskSchema.safeParse(payload),answer=resultSchema.safeParse(result);
  if(!input.success||!answer.success||input.data.operation!==answer.data.operation)throw new ResultVerificationError("Portable result verification failed: invalid result schema.");
  const started=performance.now();
  const checkCancelled=()=>{if(signal?.aborted||performance.now()-started>portableWorkloadCatalogue[input.data.operation].executionLimit.maxDurationMs)throw new ResultVerificationError("Portable result verification timed out or was cancelled.");};
  checkCancelled();
  let expected:z.infer<typeof resultSchema>;
  const task=input.data;
  if(task.operation==="sha256"){
    expected={operation:task.operation,digest:createHash("sha256").update(task.input,"utf8").digest("hex"),inputBytes:Buffer.byteLength(task.input,"utf8")};
  }else if(task.operation==="sha256_chain"){
    let bytes:Uint8Array=Buffer.from(task.input,"utf8");
    for(let iteration=0;iteration<task.iterations;iteration++){
      bytes=createHash("sha256").update(bytes).digest();
      if((iteration+1)%500===0){await yieldToIO();checkCancelled();}
    }
    expected={operation:task.operation,iterations:task.iterations,digest:Buffer.from(bytes).toString("hex")};
  }else if(task.operation==="matrix_multiply"){
    // Independent column dot-products rather than the worker's row accumulation.
    const matrix:number[][]=[];
    for(let row=0;row<task.left.length;row++){
      const output:number[]=[];
      for(let column=0;column<task.right[0]!.length;column++){
        let sum=0;
        for(let inner=0;inner<task.right.length;inner++)sum+=task.left[row]![inner]!*task.right[inner]![column]!;
        output.push(sum);
      }
      matrix.push(output);await yieldToIO();checkCancelled();
    }
    expected={operation:task.operation,matrix};
  }else if(task.operation==="portable_benchmark"){
    let state=BigInt(task.seed);
    // BigInt/modulo reference avoids sharing worker Math.imul overflow logic.
    for(let iteration=0;iteration<task.iterations;iteration++){
      state=(1664525n*state+1013904223n)%4294967296n;
      if((iteration+1)%4096===0){await yieldToIO();checkCancelled();}
    }
    expected={operation:task.operation,seed:task.seed,iterations:task.iterations,checksum:Number(state)};
  }else{
    // Reference sieve marks composites first, then counts remaining primes.
    const composite=new Uint8Array(task.limit+1);
    for(let divisor=2;divisor*divisor<=task.limit;divisor++){
      if(composite[divisor])continue;
      for(let multiple=divisor*divisor;multiple<=task.limit;multiple+=divisor)composite[multiple]=1;
      await yieldToIO();checkCancelled();
    }
    let count=0;
    for(let value=2;value<=task.limit;value++){
      if(!composite[value])count++;
      if(value%8192===0){await yieldToIO();checkCancelled();}
    }
    expected={operation:task.operation,limit:task.limit,count};
  }
  checkCancelled();
  // Property order is irrelevant; every required value must match exactly.
  for(const key of Object.keys(expected) as (keyof typeof expected)[]){
    if(JSON.stringify(answer.data[key])!==JSON.stringify(expected[key]))throw new ResultVerificationError("Portable result verification failed: answer differs from independent recomputation.");
  }
  return {...expected,verification:{status:"VERIFIED",method:"independent-recomputation",version:1,verifiedAt:new Date().toISOString(),verificationTimeMs:performance.now()-started}};
}
