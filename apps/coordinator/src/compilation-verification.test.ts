import {it,expect} from "vitest";
import {verifyCompilation,verifyIROptimization,describeVerifiedOptimization} from "./compilation-verification.js";
import {lowerCToIR,optimizeCIR} from "@omnicompile/compiler-c";
it("aborts native coordinator verification before starting a compiler or producing bytes",async()=>{
  await expect(verifyCompilation({language:"c",sourceName:"cancel.c",sourceText:"int main(void){return 0;}"},{operation:"c_compile",generatedSource:"int main(void){return 0;}"},AbortSignal.abort())).rejects.toMatchObject({name:"AbortError"});
},30000);
it("accepts equivalent IR regardless of MySQL JSON object-key order",()=>{
  const original=lowerCToIR("int main(void){int amount=2+3;return amount-5;}").functions[0]!,expected=optimizeCIR({kind:"OmniCompileCIR",version:1,functions:[original]});
  const reorder=(value:any):any=>Array.isArray(value)?value.map(reorder):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reorder(item)])):value;
  expect(verifyIROptimization(reorder(original),{operation:"c_optimize_ir",function:expected.ir.functions[0]}).function).toEqual(expected.ir.functions[0]);
});
it("rejects a worker optimizer that silently changes a program result",()=>{
  const original=lowerCToIR("int main(void){return 2+3;}").functions[0]!,expected=optimizeCIR({kind:"OmniCompileCIR",version:1,functions:[original]}),valid={operation:"c_optimize_ir",function:expected.ir.functions[0],report:{constantFolds:999999}};
  expect(verifyIROptimization(original,valid).report.constantFolds).toBe(expected.report.constantFolds);
  expect(describeVerifiedOptimization("main",verifyIROptimization(original,valid).report)).toContain(`replaced ${expected.report.constantFolds} constant-valued calculations`);
  const wrong=structuredClone(valid);const instruction=wrong.function!.instructions.find(item=>item.op==="const");if(instruction?.op==="const")instruction.value=999;
  expect(()=>verifyIROptimization(original,wrong)).toThrow(/authoritative/);
});
it("rebuilds final C output from submitted source instead of trusting a worker executable",async()=>{
  const result=await verifyCompilation({language:"c",sourceName:"invoice.c",sourceText:"int main(void){return 0;}"},{operation:"c_compile",generatedSource:"int main(void){return 0;}",artifactBase64:Buffer.concat([Buffer.from("MZ"),Buffer.alloc(62)]).toString("base64"),fileName:"invoice.exe"});expect(Buffer.from(result.artifactBase64,"base64").length).toBeGreaterThan(1000);expect(result.generatedSource).toBe("int main(void){return 0;}");expect(result.verification.method).toBe("Independent source compilation");
},30000);
it("rejects worker Python transformations that differ from the authoritative optimizer",async()=>{
  await expect(verifyCompilation({language:"python",sourceName:"invoice.py",sourceText:"amount=2+3"},{operation:"python_compile",generatedSource:"amount=999",artifactBase64:"ignored"})).rejects.toThrow(/generated source/);
},30000);
it("publishes independently recomputed DCE evidence instead of worker removal claims",async()=>{
 const source={language:'python' as const,sourceName:'dead.py',sourceText:'if False:\n    print("dead")\nprint(42)\n'};
 const {compilePython}=await import('@omnicompile/compiler-python');
 const compiled=await compilePython(source.sourceText,undefined,source.sourceName);
 const verified=await verifyCompilation(source,{operation:'python_compile',generatedSource:compiled.optimizedSource,artifactBase64:'untrusted',metrics:{optimizationEvidence:{deadCodeElimination:{status:'applied',removedStatements:999}}}});
 expect(verified.metrics.optimizationEvidence.deadCodeElimination).toMatchObject({status:'applied',removedStatements:1});
 expect(verified.generatedSource).not.toContain('dead');
});

it("publishes authoritative Java optimized source and evidence rather than worker bytes",async()=>{
 const source={language:"java" as const,sourceName:"Main.java",sourceText:"public class Main {public static void main(String[] a){System.out.print(20+22);}}"};
 const {compileJava}=await import('@omnicompile/compiler-java');const compiled=await compileJava(source.sourceText,source.sourceName);
 expect(compiled.generatedSource).toContain('(42)');
 const verified=await verifyCompilation(source,{operation:'java_compile',generatedSource:compiled.generatedSource,artifactBase64:'untrusted'});
 expect(verified.generatedSource).toBe(compiled.generatedSource);expect(verified.metrics.optimizationEvidence.language).toBe('java');expect(verified.metrics.optimizationEvidence.transformations).toBeGreaterThan(0);expect(Buffer.from(verified.artifactBase64,'base64').length).toBeGreaterThan(0);
},30000);
it("rejects Java source tampering even when a worker claims valid compilation",async()=>{
 await expect(verifyCompilation({language:'java',sourceName:'Main.java',sourceText:'public class Main {int value=20+22;}'},{operation:'java_compile',generatedSource:'public class Main {int value=999;}',artifactBase64:'untrusted'})).rejects.toThrow(/authoritative Java optimizer/);
},30000);

it('normalizes legacy IR through the trusted optimizer and publishes only original-source evidence',()=>{
 const original={name:'main',returnType:'int' as const,parameters:[],instructions:[{op:'const' as const,dest:'%t0',value:42},{op:'return' as const,value:'%t0'},{op:'call' as const,callee:'dead',dest:null,arguments:[]}]};
 const expected=optimizeCIR({kind:'OmniCompileCIR',version:1,functions:[original]});
 const result=verifyIROptimization(original,{operation:'c_optimize_ir',function:original,report:{deadInstructionsRemoved:999}});
 expect(result.function).toEqual(expected.ir.functions[0]);expect(result.report).toEqual(expected.report);expect(result.report.deadInstructionsRemoved).toBe(1);
 const reachable=structuredClone(original);reachable.instructions.unshift({op:'call',callee:'extra',dest:null,arguments:[]});
 expect(()=>verifyIROptimization(original,{operation:'c_optimize_ir',function:reachable})).toThrow(/authoritative/);
 for(const candidate of [null,{}, {...original,instructions:[{op:'invalid'}]}])expect(()=>verifyIROptimization(original,{operation:'c_optimize_ir',function:candidate})).toThrow(/authoritative/);
});
it('normalizes legacy Python folding and dead branches without accepting reachable effects or worker evidence',async()=>{
 const source={language:'python' as const,sourceName:'main.py',sourceText:'if False:\n    print("dead")\nprint(20+22)\n'};
 const legacy='if False:\n    print("dead")\nprint(42)\n';
 const result=await verifyCompilation(source,{operation:'python_compile',generatedSource:legacy,metrics:{optimizationEvidence:{deadCodeElimination:{removedStatements:999}}}});
 expect(result.generatedSource).not.toContain('dead');expect(result.metrics.optimizationEvidence.deadCodeElimination.removedStatements).toBe(1);
 await expect(verifyCompilation(source,{operation:'python_compile',generatedSource:legacy+'print("extra")\n'})).rejects.toThrow(/authoritative Python optimizer/);
 await expect(verifyCompilation(source,{operation:'python_compile',generatedSource:'def syntax('})).rejects.toThrow(/authoritative Python optimizer/);
});
it('normalizes legacy Java folding and dead branches while rejecting reachable effects',async()=>{
 const source={language:'java' as const,sourceName:'Main.java',sourceText:'public class Main {public static void main(String[] a){if(false){System.out.print("dead");}System.out.print(20+22);}}'};
 const legacy=source.sourceText.replace('20+22','(42)');
 const result=await verifyCompilation(source,{operation:'java_compile',generatedSource:legacy,metrics:{optimizationEvidence:{deadCodeElimination:{removedStatements:999}}}});
 expect(result.generatedSource).not.toContain('dead');expect(result.metrics.optimizationEvidence.deadCodeElimination.removedStatements).toBe(1);
 await expect(verifyCompilation(source,{operation:'java_compile',generatedSource:legacy.replace('System.out.print((42));','System.out.print((42));System.out.print("extra");')})).rejects.toThrow(/authoritative Java optimizer/);
 await expect(verifyCompilation(source,{operation:'java_compile',generatedSource:'public class Main { broken'})).rejects.toThrow(/authoritative Java optimizer/);
},60000);
