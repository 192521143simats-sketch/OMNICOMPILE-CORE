import {describe,it,expect} from "vitest";
import {inflateSync} from "node:zlib";
import {buildReports} from "./build-report.js";

describe("program-specific build reports",()=>{
  it("retains real runtime warnings without misclassifying stderr as an error",async()=>{
    const artifacts=await buildReports({language:"python",sourceName:"invoice.py",source:"import warnings\nwarnings.warn('deprecated rate')",artifacts:[],execution:{status:"SUCCEEDED",stdout:"",stderr:"compiled_invoice.py:2: UserWarning: deprecated rate\n  warnings.warn('deprecated rate')",exitCode:0,durationMs:20,peakMemoryBytes:900000,target:"Linux container",artifactName:"compiled_invoice.py",input:"",message:"Program exited successfully."}});
    const report=JSON.parse(artifacts[0]!.bytes.toString());expect(report.programInformation.warnings).toBe(1);expect(report.programInformation.errors).toBe(0);expect(report.programInformation.warningDetails[0]).toContain("deprecated rate");expect(report.finalResult.status).toBe("SUCCESS");
  });
  it("counts runtime errors separately and never presents failed execution as an overall success",async()=>{
    const artifacts=await buildReports({language:"python",sourceName:"invoice.py",source:"print(1/0)",artifacts:[],diagnostics:[{severity:"warning",message:"Compiler warning",line:1}],execution:{status:"FAILED",stdout:"",stderr:'Traceback (most recent call last):\n  File "/work/compiled_invoice.py", line 1, in <module>\n    print(1/0)\nZeroDivisionError: division by zero',exitCode:1,durationMs:20,peakMemoryBytes:900000,target:"Linux container",artifactName:"compiled_invoice.py",input:"",message:"Program exited with code 1."}});
    const report=JSON.parse(artifacts[0]!.bytes.toString());
    expect(report.result.status).not.toBe("Compilation Successful");
    expect(report.programInformation).toMatchObject({compilation:"Successful",warnings:1,errors:1,compilationErrors:0,executionErrors:1});
    expect(report.errors[0]).toMatchObject({phase:"execution",line:1,message:"ZeroDivisionError: division by zero",sourceFile:"compiled_invoice.py"});
    expect(report.codeQualitySummary.errors).toBe(1);
    expect(report.codeQualitySummary.overallAssessment).toMatch(/execution failed/i);
    expect(report.recommendations.join(" ")).not.toContain("no errors or warnings");
  });
  it("does not blame user code for unavailable execution infrastructure",async()=>{
    const artifacts=await buildReports({language:"c",sourceName:"main.c",source:"int main(){return 0;}",artifacts:[],execution:{status:"UNAVAILABLE",stdout:"",stderr:"",exitCode:null,durationMs:null,peakMemoryBytes:null,target:"Linux container",artifactName:null,input:"",message:"Execution infrastructure unavailable."}});
    const report=JSON.parse(artifacts[0]!.bytes.toString());
    expect(report.result.status).toMatch(/unavailable/i);expect(report.programInformation.errors).toBe(0);expect(report.errors).toBeUndefined();expect(report.finalResult.status).toBe("PARTIAL_SUCCESS");
  });
  it("uses measured execution and the usable artifact rather than source bytes",async()=>{
    const artifacts=await buildReports({language:"python",sourceName:"invoice.py",source:"print(5)",artifacts:[{artifactType:"GENERATED_SOURCE",fileName:"compiled_invoice.py",mediaType:"text/x-python",bytes:Buffer.from("print(5)\n")}],execution:{status:"SUCCEEDED",stdout:"5\n",stderr:"",exitCode:0,durationMs:25,peakMemoryBytes:1000000,target:"Linux container",artifactName:"compiled_invoice.py",input:"",message:"Program exited successfully."}} as any);
    const report=JSON.parse(artifacts[0]!.bytes.toString());
    expect(report.programExecution.status).toBe("SUCCEEDED");expect(report.programExecution.output).toBe("5\n");expect(report.programExecution.executionTimeSeconds).toBe(0.025);expect(report.resourceUsage.memoryUsedBytes).toBe(1000000);
  });
  it("distinguishes runtime failure from successful compilation and suggests the actual issue",async()=>{
    const artifacts=await buildReports({language:"python",sourceName:"invoice.py",source:"print(1/0)",artifacts:[],execution:{status:"FAILED",stdout:"",stderr:"ZeroDivisionError: division by zero",exitCode:1,durationMs:20,peakMemoryBytes:900000,target:"Linux container",artifactName:"compiled_invoice.py",input:"",message:"Program exited with code 1."}} as any);
    const report=JSON.parse(artifacts[0]!.bytes.toString());expect(report.compilationSummary.compilationStatus).toBe("Successful");expect(report.finalResult.status).toBe("PARTIAL_SUCCESS");expect(report.recommendations.join(" ")).toMatch(/divisor|denominator/i);
  });
  it("does not mistake C generated source size for executable size",async()=>{
    const artifacts=await buildReports({language:"c",sourceName:"main.c",source:"int main(){return 0;}",artifacts:[{artifactType:"GENERATED_SOURCE",fileName:"compiled_main.c",mediaType:"text/x-c",bytes:Buffer.alloc(25)},{artifactType:"EXECUTABLE",fileName:"main.exe",mediaType:"application/octet-stream",bytes:Buffer.alloc(128)}]});expect(JSON.parse(artifacts[0]!.bytes.toString()).resourceUsage.outputSizeBytes).toBe(128);
  });
  it("reports genuine compiler errors rather than unconditional success",async()=>{
    const artifacts=await buildReports({language:"c",sourceName:"broken.c",source:"int main(void) { return missing; }",artifacts:[],status:"FAILED",diagnostics:[{severity:"error",message:"'missing' undeclared",line:1,column:25}]});
    const report=JSON.parse(artifacts[0]!.bytes.toString());
    expect(report.finalResult.status).toBe("FAILED");
    expect(report.programInformation.errors).toBe(1);
    expect(report.errors[0]).toMatchObject({line:1,message:"'missing' undeclared"});
    expect(report.result.outputAvailable).toEqual(["build-report.json","build-report.pdf"]);
    expect(report.resourceUsage.memoryUsedBytes).toBeNull();
    expect(artifacts[1]!.bytes.subarray(0,4).toString()).toBe("%PDF");
  });
  it("retains real locations, measured values and performed transformations",async()=>{
    const artifacts=await buildReports({language:"python",sourceName:"invoice.py",source:"total = 2 + 3\n",artifacts:[{artifactType:"GENERATED_SOURCE",fileName:"compiled_invoice.py",mediaType:"text/x-python",bytes:Buffer.from("total = 5\n")}],diagnostics:[{severity:"warning",message:"Unused variable total",line:1,column:1}],optimizations:[{description:"Folded constant addition",line:1}],processingTimeMs:1250});
    const report=JSON.parse(artifacts[0]!.bytes.toString());
    expect(report.programInformation.warnings).toBe(1);
    expect(report.programInformation.warningDetails[0]).toContain("Line 1");
    expect(report.optimizations[0].description).toBe("Folded constant addition");
    expect(report.output.optimizedSource).toBe("total = 5\n");
    expect(report.programExecution.status).toBe("Not performed");
    expect(report.resourceUsage.processingTimeSeconds).toBe(1.25);
    expect(report.errors).toBeUndefined();
  });
});

it('reports verified optimization measurements and DCE without inventing runtime speedup',async()=>{
 const evidence={version:1,language:'python',method:'Verified AST',transformations:3,measurement:{unit:'ast-nodes',before:20,after:10,reductionPercent:999},compiler:{name:'CPython',version:'3.12',options:['-O']},artifactBytes:80,runtimeSpeedupPercent:999,deadCodeElimination:{status:'applied',method:'Unreachable statements',removedStatements:2,removedInstructions:null}};
 const artifacts=await buildReports({language:'python',sourceName:'main.py',source:'print(1)',artifacts:[],optimizationEvidence:evidence} as any);
 const report=JSON.parse(artifacts[0]!.bytes.toString());expect(report.optimizationEvidence).toMatchObject({measurement:{reductionPercent:50},deadCodeElimination:evidence.deadCodeElimination,runtimeSpeedupPercent:null});
 const pdf=artifacts[1]!.bytes.toString('latin1');
 const text=[...pdf.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].flatMap(match=>{try{return [...inflateSync(Buffer.from(match[1]!,'latin1')).toString('latin1').matchAll(/<([0-9a-f]+)>/gi)].map(token=>Buffer.from(token[1]!,'hex').toString('latin1'));}catch{return [];}}).join('');
 expect(text).toContain('Verified optimization evidence');expect(text).toContain('CPython 3.12');expect(text).toContain('DCE status: applied');expect(text).toContain('Removed statements: 2');expect(text).toContain('Runtime speedup: Not measured');expect(text).not.toContain('999');
 const unmeasured=JSON.parse((await buildReports({language:'c',sourceName:'main.c',source:'',artifacts:[],status:'FAILED'}))[0]!.bytes.toString());expect(unmeasured.optimizationEvidence).toBeNull();
});

it.each([
 ['c','artifact-bytes','Native executable'],
 ['c','ir-cost','Verified IR and native executable'],
 ['python','ast-nodes','Source and Python bytecode'],
 ['java','ast-operators','Source and JVM bytecode'],
] as const)('identifies the actual optimization target for %s / %s',async(language,unit,target)=>{
 const evidence={version:1,language,method:'Verified optimization',transformations:0,measurement:{unit,before:10,after:10,reductionPercent:0},compiler:null,artifactBytes:10,runtimeSpeedupPercent:null,deadCodeElimination:{status:'compiler-managed',method:'Compiler pass',removedStatements:null,removedInstructions:null}};
 const artifacts=await buildReports({language,sourceName:'main',source:'unchanged',artifacts:[{artifactType:'GENERATED_SOURCE',fileName:'compiled.c',mediaType:'text/plain',bytes:Buffer.from('unchanged')}],optimizationEvidence:evidence});
 const report=JSON.parse(artifacts[0]!.bytes.toString());expect(report.output.optimizationTarget).toBe(target);expect(report.output.optimizedSource).toBe('unchanged');
 if(language==='c'&&unit==='artifact-bytes')expect(report.output.filePurposes[0].purpose).toBe('Compiler-input source; optimization applies to the native executable');
 const pdf=artifacts[1]!.bytes.toString('latin1');const text=[...pdf.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].flatMap(match=>{try{return [...inflateSync(Buffer.from(match[1]!,'latin1')).toString('latin1').matchAll(/<([0-9a-f]+)>/gi)].map(token=>Buffer.from(token[1]!,'hex').toString('latin1'));}catch{return [];}}).join('');expect(text).toContain(`Optimization target: ${target}`);
 const failed=JSON.parse((await buildReports({language,sourceName:'main',source:'',artifacts:[],status:'FAILED',optimizationEvidence:evidence}))[0]!.bytes.toString());expect(failed.output.optimizationTarget).toBe('Not measured');
});
it('does not infer an optimization target from missing or malformed evidence',async()=>{
 for(const optimizationEvidence of [undefined,{version:1,language:'c',method:'unverified'}]){
  const report=JSON.parse((await buildReports({language:'c',sourceName:'main.c',source:'',artifacts:[],optimizationEvidence}))[0]!.bytes.toString());expect(report.output.optimizationTarget).toBe('Not measured');
 }
});
