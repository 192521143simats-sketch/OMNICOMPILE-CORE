import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { executeDeterministicPortable,workPayloadSchema, type WorkPayload } from "@omnicompile/contracts";
import {optimizeCIR,compileCSource,type IRFunction} from "@omnicompile/compiler-c";
import {compilePython} from "@omnicompile/compiler-python";
import {compileJava} from "@omnicompile/compiler-java";

function primeCount(limit:number){const composite=new Uint8Array(limit+1);let count=0;for(let n=2;n<=limit;n++){if(composite[n]===0){count++;if(n*n<=limit)for(let multiple=n*n;multiple<=limit;multiple+=n)composite[multiple]=1;}}return count;}

export async function execute(payload:WorkPayload){
  const validated=workPayloadSchema.parse(payload);const started=performance.now();let result:unknown;
  if(validated.operation==="sha256")result={operation:"sha256",digest:createHash("sha256").update(validated.input).digest("hex"),inputBytes:Buffer.byteLength(validated.input)};
  else if(validated.operation==="prime_count")result={operation:"prime_count",limit:validated.limit,count:primeCount(validated.limit)};
  else if(validated.operation==="sha256_chain"){let digest=Buffer.from(validated.input);for(let iteration=0;iteration<validated.iterations;iteration++){digest=createHash("sha256").update(digest).digest();if(iteration>0&&iteration%10_000===0)await new Promise<void>(resolve=>setImmediate(resolve));}result={operation:"sha256_chain",iterations:validated.iterations,digest:digest.toString("hex")};}
  else if(validated.operation==="matrix_multiply"||validated.operation==="portable_benchmark")result=await executeDeterministicPortable(validated,()=>new Promise(resolve=>setImmediate(resolve)));
  else if(validated.operation==="c_optimize_ir"){const optimized=optimizeCIR({kind:"OmniCompileCIR",version:1,functions:[validated.function as IRFunction]});result={operation:"c_optimize_ir",function:optimized.ir.functions[0],report:optimized.report};}
  else if(validated.operation==="c_compile"){const compiled=await compileCSource(validated.source,validated.sourceName);result={operation:"c_compile",artifactBase64:compiled.bytes.toString("base64"),fileName:compiled.fileName,generatedSource:compiled.generatedSource,diagnostics:compiled.diagnostics,metrics:{compiler:compiled.compiler,artifactBytes:compiled.bytes.length}};}
  else if(validated.operation==="python_compile"){const compiled=await compilePython(validated.source,undefined,validated.sourceName);result={operation:"python_compile",artifactBase64:compiled.bytecode.toString("base64"),fileName:compiled.artifactName,mediaType:"application/x-python-bytecode",generatedSource:compiled.optimizedSource,diagnostics:compiled.diagnostics,optimizations:compiled.optimizations,metrics:{pythonVersion:compiled.pythonVersion,representation:compiled.representation,...compiled.metrics}};}
  else{const compiled=await compileJava(validated.source,validated.sourceName);result={operation:"java_compile",artifactBase64:compiled.jar.bytes.toString("base64"),fileName:compiled.jar.fileName,mediaType:"application/java-archive",generatedSource:compiled.generatedSource,runnableJar:compiled.jar.runnable,classes:Object.entries(compiled.classes).map(([fileName,bytes])=>({fileName,contentBase64:bytes.toString("base64")})),diagnostics:compiled.diagnostics,metrics:{jdkVersion:compiled.jdkVersion,representation:compiled.representation,primaryClass:compiled.primaryClass,runnableJar:compiled.jar.runnable,...compiled.metrics}};}
  return {result,executionTimeMs:performance.now()-started};
}
