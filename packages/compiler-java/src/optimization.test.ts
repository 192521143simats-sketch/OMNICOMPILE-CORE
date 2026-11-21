import { expect, it } from "vitest";
import { compileJava } from "./pipeline.js";
it("folds only javac AST int constants and records structural evidence", async () => {
 const source='public class Main { int x=(2147483647+1); int y=3*(4+5); int z=call()+2; int call(){return 7;} String s="3*(4+5)"; }';
 const result=await compileJava(source);
 expect(result.generatedSource).toContain('(-2147483648)');
 expect(result.generatedSource).toContain('(27)');
 expect(result.generatedSource).toContain('call()+2');
 expect(result.generatedSource).toContain('"3*(4+5)"');
 expect(result.metrics.optimizationEvidence).toMatchObject({language:'java', transformations:2, runtimeSpeedupPercent:null});
},30000);
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { javaRuntimePath, JavaFrontendError } from "./pipeline.js";
it("preserves trusted fixture execution including overflow, shifts, scope and side effects", async () => {
 const source=String.raw`public class Main {
 static int calls=0; static int call(){calls++;return 5;}
 public static void main(String[] args){
 int café=2147483647+1; int min=-2147483648/-1;
 int shift=(-1>>>33)+(1<<34); int mixed=call()+(3*7);
 { int local=7%3;System.out.print(local+":"); }
 System.out.print(café+":"+min+":"+shift+":"+mixed+":"+calls+":"+(1L+2L)+":"+(1.0+2.0)+":"+'a'+":"+"1+2");
 }} `;
 const result=await compileJava(source);
 expect(result.generatedSource).toContain('1L+2L');
 expect(result.generatedSource).toContain('1.0+2.0');
 const dir=await mkdtemp(join(tmpdir(),'java-fold-trusted-'));
 const java=await javaRuntimePath(),run=promisify(execFile);
 try{
  const original=join(dir,'Main.java'),jar=join(dir,'optimized.jar');
  await writeFile(original,source);await writeFile(jar,result.jar.bytes);
  await run(join(dirname(java),process.platform==='win32'?'javac.exe':'javac'),['-encoding','UTF-8','-proc:none',original],{timeout:10000,windowsHide:true});
  const baseline=await run(java,['-cp',dir,'Main'],{timeout:5000,windowsHide:true});
  const optimized=await run(java,['-jar',jar],{timeout:5000,windowsHide:true});
  expect(optimized.stdout).toBe(baseline.stdout);
 }finally{await rm(dir,{recursive:true,force:true});}
},30000);
it("keeps unsupported and effectful expressions and original error positions",async()=>{
 const source=String.raw`public class Main { int x=1/0; long y=1L+2L; String s="1+2"; /* 1+2 */ int f(int a){return a+2;} }`;
 const result=await compileJava(source);
 expect(result.generatedSource).toBe(source);
 expect(result.metrics.optimizationEvidence.transformations).toBe(0);
 try{await compileJava('public class Main { int a=1+2;\n int b=missing; }');throw Error('expected diagnostic');}
 catch(error){expect(error).toBeInstanceOf(JavaFrontendError);expect((error as JavaFrontendError).diagnostics[0]?.line).toBe(2);}
},30000);
it("folds compiler positions across Unicode escapes without rewriting strings",async()=>{
 const result=await compileJava(String.raw`public class Main { int x=\u0031+2; String s="\u0031+2"; }`);
 expect(result.generatedSource).toContain('int x=(3)');
 expect(result.generatedSource).toContain(String.raw`String s="\u0031+2"`);
},30000);
