import {mkdtemp,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawn} from "node:child_process";
import {describe,expect,it} from "vitest";
import * as codegen from "./codegen.js";
import {compileCExecutable,emitCFromIR} from "./codegen.js";
import {lowerCToIR} from "./lowering.js";
import {optimizeCIR} from "./optimize.js";

describe("C native code generation",()=>{
  it("does not disclose configured toolchain filesystem paths in errors",async()=>{const prior=process.env.GCC_EXECUTABLE;try{process.env.GCC_EXECUTABLE=join(tmpdir(),"private-gcc-path-fixture","gcc.exe");try{await codegen.compileCSource("int main(void){return 0;}");throw new Error("Unexpected compiler success");}catch(error){expect(error).toBeInstanceOf(codegen.CToolchainError);expect((error as Error).message).not.toContain("private-gcc-path-fixture");}}finally{if(prior===undefined)delete process.env.GCC_EXECUTABLE;else process.env.GCC_EXECUTABLE=prior;}});
  it("bounds derived executable names for accepted long source filenames",async()=>{const artifact=await compileCExecutable(lowerCToIR("int main(void){return 0;}"),"x".repeat(253));expect(artifact.fileName.length).toBeLessThanOrEqual(255);expect(artifact.bytes.length).toBeGreaterThan(100);});
  it("compiles actual C headers, structs and strings without rewriting source",async()=>{
    const source='#include <stdio.h>\nstruct Pair { int x; int y; };\nint main(void) { struct Pair p={2,3}; puts("hello"); return p.x+p.y; }\n';
    const artifact=await codegen.compileCSource(source,"pairs.c");
    expect(artifact.generatedSource).toBe(source);expect(artifact.bytes.length).toBeGreaterThan(1000);expect(artifact.diagnostics).toEqual([]);expect(artifact.compiler).toMatch(/gcc/i);
  },30_000);
  it("reports invalid source with original line and no temporary workspace path",async()=>{
    try { await codegen.compileCSource("int main(void) {\n  return missing;\n}\n","invalid.c");throw new Error("expected invalid C to fail"); }
    catch(error){expect(error).toBeInstanceOf(codegen.CToolchainError);const failure=error as codegen.CToolchainError;expect(failure.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({severity:"error",line:2,message:expect.stringContaining("missing")})]));expect(failure.message).not.toContain("omnicompile-c-");}
  },30_000);
  it("keeps warnings as successful structured diagnostics",async()=>{const result=await codegen.compileCSource("int main(void) { int unused; return 0; }\n");expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({severity:"warning",code:"-Wunused-variable",line:1})]));},30_000);
  it("preserves short circuit side effects and boolean results before and after optimization",async()=>{
    for(const source of ["int main(void){int x=0;int y=0&&(x=7);return x+y;}","int main(void){int x=0;int y=4||(x=7);return x+y;}","int main(void){int x=0;int y=1&&(x=7);return x+y;}"]){
      for(const optimized of [false,true]){const ir=lowerCToIR(source),artifact=await compileCExecutable(optimized?optimizeCIR(ir).ir:ir);expect(await fixtureExit(artifact)).toBe(source.includes("4||")?1:source.includes("1&&")?8:0);}
    }
  },30_000);
  it("supports calls to later functions and discarded void results",async()=>{const artifact=await compileCExecutable(lowerCToIR("int main(void){noop();return later(6);} void noop(void){return;} int later(int x){return x;}"));expect(await fixtureExit(artifact)).toBe(6);},30_000);
  it("preserves nested lexical shadowing and loop control flow after optimization",async()=>{const ir=lowerCToIR("int main(void){int x=3;{int x=9;x=x+1;}int i=0;while(i<4){x=x+2;i=i+1;}return x;}");for(const optimized of [false,true])expect(await fixtureExit(await compileCExecutable(optimized?optimizeCIR(ir).ir:ir))).toBe(11);},30_000);
  it("bounds source size before invoking GCC",async()=>{await expect(codegen.compileCSource(" ".repeat(1_000_001))).rejects.toMatchObject({diagnostics:[expect.objectContaining({code:"C_SOURCE_LIMIT",line:null,column:null})]});});
  it("treats a display filename as C source even without a C extension",async()=>{expect((await codegen.compileCSource("int main(void){return 0;}","submission.txt")).bytes.length).toBeGreaterThan(1000);},30_000);
  it("uses configured GCC and reports unavailable toolchains structurally",async()=>{const prior=process.env.GCC_EXECUTABLE;try{process.env.GCC_EXECUTABLE="omnicompile-nonexistent-gcc-fixture";await expect(codegen.compileCSource("int main(void){return 0;}" )).rejects.toMatchObject({diagnostics:[expect.objectContaining({severity:"error",code:"C_TOOLCHAIN",line:null,column:null})]});}finally{if(prior===undefined)delete process.env.GCC_EXECUTABLE;else process.env.GCC_EXECUTABLE=prior;}});
  it("emits readable C with explicit control flow",()=>{const source=emitCFromIR(lowerCToIR("int main(void){int x=1;if(x)return 2;else return 3;}"));expect(source).toContain("int main(void)");expect(source).toContain("goto main_then_");});
  it("builds a genuine native executable that returns the computed value",async()=>{const ir=optimizeCIR(lowerCToIR("int answer(int x){return x+0;} int main(void){return answer(42);}" )).ir,artifact=await compileCExecutable(ir,"answer"),workspace=await mkdtemp(join(tmpdir(),"omnicompile-test-")),path=join(workspace,artifact.fileName);try{expect(artifact.bytes.byteLength).toBeGreaterThan(1_000);await writeFile(path,artifact.bytes);const code=await new Promise<number>((resolve,reject)=>{const child=spawn(path,[],{windowsHide:true});child.on("error",reject);child.on("close",value=>resolve(value??-1));});expect(code).toBe(42);}finally{await rm(workspace,{recursive:true,force:true});}},30_000);
});

async function fixtureExit(artifact:codegen.CNativeArtifact){const workspace=await mkdtemp(join(tmpdir(),"omnicompile-fixture-")),path=join(workspace,artifact.fileName);try{await writeFile(path,artifact.bytes,{mode:0o700});return await new Promise<number>((resolve,reject)=>{const child=spawn(path,[],{windowsHide:true});child.on("error",reject);child.on("close",value=>resolve(value??-1));});}finally{await rm(workspace,{recursive:true,force:true});}}
