import {compileCSource,optimizeCIR,type IRFunction} from "@omnicompile/compiler-c";
import {cIrFunctionSchema} from "@omnicompile/contracts";
import {compilePython} from "@omnicompile/compiler-python";
import {compileJava} from "@omnicompile/compiler-java";
import {isDeepStrictEqual} from "node:util";
import {runCompilerProcess} from './compiler-process-control.js';
type Source={language:"c"|"python"|"java";sourceName:string;sourceText:string};

/** Final published native bytes are rebuilt from authoritative source, not worker bytes. */
export async function verifyCompilation(source:Source,worker:any,signal?:AbortSignal):Promise<any>{
  if(signal||process.env[`OMNICOMPILE_${source.language.toUpperCase()}_COMPILER_URL`]){
    const cancellation=signal??new AbortController().signal;
    cancellation.throwIfAborted();
    const {language,sourceName,sourceText}=source;
    return runCompilerProcess({action:'verify',source:{language,sourceName,sourceText},worker},cancellation);
  }
  if(worker.operation!==`${source.language}_compile`)throw new Error("Worker compilation language mismatch");
  const verification={method:"Independent source compilation",language:source.language};
  if(source.language==="c"){
    if(worker.generatedSource!==source.sourceText)throw new Error("Worker generated source does not match submitted C source");
    const compiled=await compileCSource(source.sourceText,source.sourceName);
    return{operation:"c_compile",artifactBase64:compiled.bytes.toString("base64"),fileName:compiled.fileName,generatedSource:compiled.generatedSource,diagnostics:compiled.diagnostics,verification,metrics:{compiler:compiled.compiler,artifactBytes:compiled.bytes.length,optimizationEvidence:compiled.optimizationEvidence,verification}};
  }
  if(source.language==="python"){
    const compiled=await compilePython(source.sourceText,undefined,source.sourceName);
    if(worker.generatedSource!==compiled.optimizedSource){
      const matches=await normalizedSourceMatches(worker.generatedSource,compiled.optimizedSource,async candidate=>(await compilePython(candidate,undefined,source.sourceName)).optimizedSource);
      if(!matches)throw new Error("Worker generated source does not match the authoritative Python optimizer");
    }
    return{operation:"python_compile",artifactBase64:compiled.bytecode.toString("base64"),fileName:compiled.artifactName,generatedSource:compiled.optimizedSource,diagnostics:compiled.diagnostics,optimizations:compiled.optimizations,verification,metrics:{pythonVersion:compiled.pythonVersion,...compiled.metrics,verification}};
  }
  const compiled=await compileJava(source.sourceText,source.sourceName);
  if(worker.generatedSource!==compiled.generatedSource){
    const matches=await normalizedSourceMatches(worker.generatedSource,compiled.generatedSource,async candidate=>(await compileJava(candidate,source.sourceName)).generatedSource);
    if(!matches)throw new Error("Worker generated source does not match the authoritative Java optimizer");
  }
  return{operation:"java_compile",artifactBase64:compiled.jar.bytes.toString("base64"),fileName:compiled.jar.fileName,generatedSource:compiled.generatedSource,runnableJar:compiled.jar.runnable,classes:Object.entries(compiled.classes).map(([fileName,bytes])=>({fileName,contentBase64:bytes.toString("base64")})),diagnostics:compiled.diagnostics,verification,metrics:{jdkVersion:compiled.jdkVersion,...compiled.metrics,verification}};
}
// Candidate compilation never executes submitted programs. Its only usable result
// is canonical text equality; published bytes and metrics always come from source.
async function normalizedSourceMatches(candidate:unknown,expected:string,normalize:(source:string)=>Promise<string>){
  if(typeof candidate!=="string"||Buffer.byteLength(candidate,"utf8")>1_000_000)return false;
  try{return await normalize(candidate)===expected;}catch{return false;}
}
export function verifyIROptimization(original:IRFunction,worker:any){
  const expected=optimizeCIR({kind:"OmniCompileCIR",version:1,functions:[original]});
  // MySQL JSON normalizes key order; wire JSON also normalizes -0 to integer 0.
  const equal=(candidate:unknown)=>isDeepStrictEqual(JSON.parse(JSON.stringify(candidate)),JSON.parse(JSON.stringify(expected.ir.functions[0])));
  let matches=false;
  if(worker.operation==="c_optimize_ir")try{
    matches=equal(worker.function);
    if(!matches){
      const candidate=cIrFunctionSchema.parse(worker.function);
      matches=equal(optimizeCIR({kind:"OmniCompileCIR",version:1,functions:[candidate]}).ir.functions[0]);
    }
  }catch{/* Invalid candidates are authoritative mismatches, never published. */}
  if(!matches)throw new Error("Worker optimization differs from the authoritative transformation");
  return{operation:"c_optimize_ir",function:expected.ir.functions[0],report:expected.report};
}
export function describeVerifiedOptimization(functionName:string,report:unknown){
  const counts=report as {constantFolds:number;algebraicSimplifications:number;deadInstructionsRemoved:number};
  if(!counts||![counts.constantFolds,counts.algebraicSimplifications,counts.deadInstructionsRemoved].every(value=>Number.isInteger(value)&&value>=0))throw new Error("Verified optimization evidence is missing");
  return `Function ${functionName}: replaced ${counts.constantFolds} constant-valued calculations, applied ${counts.algebraicSimplifications} algebraic simplifications, and removed ${counts.deadInstructionsRemoved} dead or unreachable IR instructions.`;
}
