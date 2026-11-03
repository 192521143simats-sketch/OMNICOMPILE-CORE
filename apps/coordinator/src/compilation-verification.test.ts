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
