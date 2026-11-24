import {compiledDownloads} from "./compiler-artifacts.js";
import PDFDocument from "pdfkit";
import type {StoredArtifact} from "./database.js";
import type {ExecutionEvidence} from "./execution-evidence.js";
import {summarizeOptimizationEvidence} from "./compiler-metrics.js";
import {diagnosticAdvice} from "./diagnostic-advice.js";

type Language="c"|"python"|"java";
export type ReportDiagnostic={severity:"error"|"warning";message:string;line?:number|null|undefined;column?:number|null|undefined;phase?:"compilation"|"execution";sourceFile?:string};
export type ReportOptimization={description:string;line?:number|null};
type ReportInput={jobId?:string;measurements?:Record<string,unknown>;optimizationEvidence?:unknown;language:Language;sourceName:string;source:string;artifacts:StoredArtifact[];warnings?:string[];diagnostics?:ReportDiagnostic[];optimizations?:ReportOptimization[];status?:"SUCCESS"|"FAILED";runnableJar?:boolean;processingTimeMs?:number|undefined;memoryBytes?:number|undefined;execution?:ExecutionEvidence};
type BuildReport={jobId?:string|undefined;measurements?:Record<string,unknown>|undefined;optimizationEvidence:ReturnType<typeof summarizeOptimizationEvidence>["items"][number]|null;title:string;compilationSummary:{sourceFile:string;language:string;compilationStatus:string;dateTime:string;sourceSizeBytes:number;sourceLines:number};result:{status:string;message:string;outputAvailable:string[]};programInformation:{language:string;sourceFile:string;sourceLines:number;compilation:string;warnings:number;errors:number;compilationErrors:number;executionErrors:number;warningDetails:string[]};output:{optimizationTarget:string;generatedFiles:string[];filePurposes:Array<{file:string;purpose:string}>;howToUse:string};programExecution:{message:string};resourceUsage:{processingTimeSeconds:number|null;memoryUsedBytes:number|null;outputSizeBytes:number|null};codeQualitySummary:{syntax:string;compilationProcessing:string;errors:number;warnings:number;outputGeneration:string;overallAssessment:string};recommendations:string[];finalResult:{status:string;message:string;availableArtifacts:string[]}};

// Count the failed execution once, not once per stack frame. Locations refer to
// the actually executed generated file; optimizations can change source lines.
function executionDiagnostic(execution:ExecutionEvidence):ReportDiagnostic[] {
  if(!["FAILED","TIMED_OUT","OUTPUT_LIMIT"].includes(execution.status))return [];
  const lines=execution.stderr.split(/\r?\n/),exception=lines.find(line=>/^Exception in thread /.test(line))??[...lines].reverse().find(line=>/^[\w.$]*(?:Error|Exception):/.test(line));
  const pythonLocation=[...execution.stderr.matchAll(/File "([^"\n]+)", line (\d+)/g)].reverse().find(match=>match[1]?.split(/[\\/]/).pop()===execution.artifactName);
  const javaLocation=execution.stderr.match(/\(([^():\n]+\.java):(\d+)\)/);
  const location=pythonLocation??javaLocation;
  return [{severity:"error",phase:"execution",message:exception?.trim()||execution.message,line:location?Number(location[2]):null,column:null,...(location?{sourceFile:location[1]!.split(/[\\/]/).pop()!}:{})}];
}

export async function buildReports(input:ReportInput):Promise<StoredArtifact[]>{
  const diagnostics=input.diagnostics??[],compilationErrors=diagnostics.filter(item=>item.severity==="error"),successful=input.status!=="FAILED"&&compilationErrors.length===0;
  const runtimeErrors=successful&&input.execution?executionDiagnostic(input.execution):[],errors=[...compilationErrors.map(item=>({...item,phase:"compilation" as const})),...runtimeErrors];
  const executionWarnings=successful&&input.language==="python"?input.execution?.stderr.split(/\r?\n/).filter(line=>/^.*?:\d+: [\w.]*Warning:/.test(line))??[]:[];
  const warnings=[...new Set([...(input.warnings??[]),...diagnostics.filter(item=>item.severity==="warning").map(item=>`${item.line?`Line ${item.line}: `:""}${item.message}`),...executionWarnings])];
  const executionFailed=successful&&input.execution&&!['SUCCEEDED','NOT_RUN'].includes(input.execution.status);
  const assessment=!successful?"The program could not be compiled. Review the compilation errors below.":executionFailed?input.execution!.status==="UNAVAILABLE"?"Compilation succeeded, but execution was unavailable. The generated artifacts are available; program behavior was not verified.":"Compilation succeeded, but execution failed. The generated artifacts are available; review the execution diagnostics before using the program.":input.execution?.status==="SUCCEEDED"?"Compilation and execution succeeded for the supplied input. The generated output is ready to use.":"Compilation succeeded. Execution was not performed; program behavior was not verified.";
  const names=compiledDownloads(input.language,input.artifacts).map(artifact=>artifact.fileName);
  const outputs=compiledDownloads(input.language,input.artifacts);
  const sourceLines=input.source.replace(/\r?\n$/,"").split(/\r?\n/).length;
  const optimizationEvidence=successful?summarizeOptimizationEvidence([{language:input.language,metrics:{optimizationEvidence:input.optimizationEvidence}}]).items[0]??null:null;
  const nativeC=optimizationEvidence?.language==='c'&&optimizationEvidence.measurement?.unit==='artifact-bytes';
  const optimizationTarget=!optimizationEvidence?'Not measured':input.language==='python'?'Source and Python bytecode':input.language==='java'?'Source and JVM bytecode':optimizationEvidence.measurement?.unit==='ir-cost'?'Verified IR and native executable':nativeC?'Native executable':'Not measured';
  const purposes:Record<StoredArtifact["artifactType"],string>={SOURCE:"Original source code",GENERATED_SOURCE:nativeC?"Compiler-input source; optimization applies to the native executable":"Final generated or optimized source code",EXECUTABLE:"Runnable compiled program",BYTECODE:input.language==="java"?"Compiled Java class":"Compiled Python bytecode",JAR:"Java archive",BUILD_REPORT_JSON:"Machine-readable build report",BUILD_REPORT_PDF:"This build report"};
  const report={
    jobId:input.jobId,measurements:input.measurements,
    optimizationEvidence,
    title:"OmniCompile Core - Build Report",
    compilationSummary:{sourceFile:input.sourceName,language:input.language.toUpperCase(),compilationStatus:successful?"Successful":"Failed",dateTime:new Date().toLocaleString("en-GB",{timeZone:"Asia/Kolkata",day:"2-digit",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:true}),sourceSizeBytes:Buffer.byteLength(input.source),sourceLines},
    result:{status:!successful?"Compilation Failed":executionFailed?input.execution!.status==="UNAVAILABLE"?"Execution Unavailable - Compilation Successful":"Execution Failed - Compilation Successful":input.execution?.status==="SUCCEEDED"?"Compilation and Execution Successful":"Compilation Successful - Execution Not Performed",message:assessment,outputAvailable:[...names,"build-report.pdf"]},
    programInformation:{language:input.language.toUpperCase(),sourceFile:input.sourceName,sourceLines,compilation:successful?"Successful":"Failed",warnings:warnings.length,errors:errors.length,compilationErrors:compilationErrors.length,executionErrors:runtimeErrors.length,warningDetails:warnings},
    output:{optimizationTarget,generatedFiles:[...names,"build-report.pdf"],filePurposes:[...compiledDownloads(input.language,input.artifacts).map(artifact=>({file:artifact.fileName,purpose:purposes[artifact.artifactType]})),{file:"build-report.pdf",purpose:purposes.BUILD_REPORT_PDF}],howToUse:input.language==="c"?"Run the executable on a compatible operating system and CPU architecture; Linux ELF files require executable permission.":input.language==="python"?`Run python "${outputs[0]?.fileName??"<downloaded-file.pyc>"}" using the same CPython major/minor version recorded in this report; bytecode is version-specific.`:input.runnableJar===false?"This archive is a compiled library with no main entry point; add it to an application classpath.":`Run java -jar "${outputs[0]?.fileName??"<downloaded-file.jar>"}" with a compatible Java runtime.`},
    programExecution:{status:"Not performed",message:"Execution was not performed. The generated artifact is available for download.",output:null,executionTimeSeconds:null},
    resourceUsage:{processingTimeSeconds:input.processingTimeMs===undefined?null:Number((input.processingTimeMs/1000).toFixed(3)),memoryUsedBytes:input.execution?.peakMemoryBytes??input.memoryBytes??null,outputSizeBytes:outputs.length?outputs.reduce((sum,item)=>sum+item.bytes.byteLength,0):null},
    codeQualitySummary:{syntax:successful?"Passed":"Not confirmed",compilationProcessing:successful?"Passed":"Failed",errors:errors.length,warnings:warnings.length,outputGeneration:successful?"Passed":"Not produced",overallAssessment:assessment},
    recommendations:diagnostics.length?diagnostics.map(item=>`${item.line?`Line ${item.line}: `:""}${item.message} - ${diagnosticAdvice(item.message)}`):warnings.length?warnings.map(warning=>`Review ${warning}`):errors.length||executionFailed?[]:["The compiler reported no errors or warnings. This does not prove program correctness for every input."],
    finalResult:{status:successful?"SUCCESS":"FAILED",message:successful?`Your ${input.language.toUpperCase()} program was successfully processed.`:`Your ${input.language.toUpperCase()} program could not be compiled.`,availableArtifacts:[...names,"build-report.pdf"]},
    ...(errors.length?{errors}:{}),
    optimizations:input.optimizations??[],
    reportGeneratedBy:"OmniCompile Core"
  };
  Object.assign(report.output,{optimizedSource:input.artifacts.find(item=>item.artifactType==="GENERATED_SOURCE")?.bytes.toString("utf8")??null});
  if(successful&&input.execution){const execution=input.execution;Object.assign(report.programExecution,{...execution,output:execution.stdout,executionTimeSeconds:execution.durationMs===null?null:execution.durationMs/1000,memoryMeasurement:"Peak child process resident memory in the isolated Linux environment, not total compilation memory."});if(!["SUCCEEDED","NOT_RUN"].includes(execution.status)){report.finalResult.status="PARTIAL_SUCCESS";report.finalResult.message="Compilation succeeded, but execution was not successful. The generated artifacts and execution details are available.";report.recommendations.push(execution.status==="TIMED_OUT"?"Check termination conditions and computational cost; execution exceeded the allowed time.":execution.status==="OUTPUT_LIMIT"?"Reduce unbounded output or correct a repeating print loop.":execution.status==="UNAVAILABLE"?"Execution infrastructure was unavailable. Do not infer a program error from this result.":diagnosticAdvice(execution.stderr||execution.message));}}
  if(!successful){report.programExecution.message="Execution was not performed. Compilation failed; no usable output was produced.";report.output.howToUse="No usable output was produced. Correct the reported source issues and compile again.";}
  if(input.language==="java"&&input.runnableJar===false){report.output.howToUse="This is a Java library archive, not a runnable program. Use its classes from a compatible Java application.";const jar=report.output.filePurposes.find(item=>item.file.endsWith(".jar"));if(jar)jar.purpose="Java library archive (no runnable main entry point)";}
  const json:StoredArtifact={artifactType:"BUILD_REPORT_JSON",fileName:"build-report.json",mediaType:"application/json",bytes:Buffer.from(JSON.stringify(report,null,2),"utf8")};
  const pdf=await renderPdf(report);
  return[json,{artifactType:"BUILD_REPORT_PDF",fileName:"build-report.pdf",mediaType:"application/pdf",bytes:pdf}];
}

function renderPdf(report:BuildReport&{errors?:ReportDiagnostic[];optimizations:ReportOptimization[]}):Promise<Buffer>{
  return new Promise((resolve,reject)=>{
    const document=new PDFDocument({size:"A4",margin:42,info:{Title:report.title,Author:"OmniCompile Core"}}),chunks:Buffer[]=[];
    document.on("data",chunk=>chunks.push(Buffer.from(chunk)));document.on("error",reject);document.on("end",()=>resolve(Buffer.concat(chunks)));
    const heading=(number:number,title:string)=>{if(document.y>document.page.height-document.page.margins.bottom-100)document.addPage();document.moveDown(0.45).font("Helvetica-Bold").fontSize(12).text(`${number}. ${title}`).moveDown(0.2);document.font("Helvetica").fontSize(9);};
    const line=(label:string,value:unknown)=>document.text(`${label}: ${value===null||value===undefined?"Not available":String(value)}`);
    const files=(items:string[])=>items.forEach(name=>document.text(`- ${name}`));
    document.font("Helvetica-Bold").fontSize(18).text(report.title).font("Helvetica").fontSize(9);
    heading(1,"Compilation Summary");line("Source File",report.compilationSummary.sourceFile);line("Language",report.compilationSummary.language);line("Compilation Status",report.compilationSummary.compilationStatus);line("Date & Time",report.compilationSummary.dateTime);line("Source Size",`${report.compilationSummary.sourceSizeBytes} bytes (${(report.compilationSummary.sourceSizeBytes/1024).toFixed(2)} KB)`);line("Source Lines",report.compilationSummary.sourceLines);
    heading(2,"Result");document.font("Helvetica-Bold").text(report.result.status).font("Helvetica").text(report.result.message);document.text("Output Available:");files(report.result.outputAvailable);
    heading(3,"Program Information");line("Language",report.programInformation.language);line("Source File",report.programInformation.sourceFile);line("Source Lines",report.programInformation.sourceLines);line("Compilation",report.programInformation.compilation);line("Warnings",report.programInformation.warnings);line("Errors (compilation + execution)",report.programInformation.errors);line("Compilation errors",report.programInformation.compilationErrors);line("Execution failures",report.programInformation.executionErrors);report.programInformation.warningDetails.length?report.programInformation.warningDetails.forEach(warning=>document.text(warning)):document.text("No warnings detected.");
    heading(4,"Output / Artifact");line("Optimization target",report.output.optimizationTarget);document.text("Generated Files:");report.output.filePurposes.forEach(item=>document.text(`- ${item.file}: ${item.purpose}`));document.text(`How to Use: ${report.output.howToUse}`);
    heading(5,"Program Execution");document.text(report.programExecution.message);const execution=report.programExecution as typeof report.programExecution&Partial<ExecutionEvidence>;if(execution.status){line("Execution Status",execution.status);line("Target",execution.target);line("Executed Artifact",execution.artifactName);line("Exit Code",execution.exitCode);line("Program runtime (excludes compilation)",execution.durationMs==null?null:`${(execution.durationMs/1000).toFixed(3)} seconds`);if(execution.stdout){document.text("Standard output:").text(execution.stdout);}if(execution.stderr){document.text("Runtime diagnostics:").text(execution.stderr);}}
    heading(6,"Resource Usage");line("Submission to report snapshot",report.resourceUsage.processingTimeSeconds===null?null:`${report.resourceUsage.processingTimeSeconds} seconds`);line("Memory Used",report.resourceUsage.memoryUsedBytes===null?null:`${(report.resourceUsage.memoryUsedBytes/1024/1024).toFixed(1)} MB`);if(execution.peakMemoryBytes!=null)document.text("Memory measurement: peak executed child process resident memory, not total compilation memory.");line("Compiled download bytes (excluding PDF)",report.resourceUsage.outputSizeBytes===null?null:`${report.resourceUsage.outputSizeBytes} bytes (${(report.resourceUsage.outputSizeBytes/1024).toFixed(2)} KB)`);
    heading(7,"Code Quality Summary");line("Syntax",report.codeQualitySummary.syntax);line("Compilation / Processing",report.codeQualitySummary.compilationProcessing);line("Errors",report.codeQualitySummary.errors);line("Warnings",report.codeQualitySummary.warnings);line("Output Generation",report.codeQualitySummary.outputGeneration);document.text(report.codeQualitySummary.overallAssessment);
    if(report.errors?.length){heading(8,"Errors");report.errors.forEach(error=>document.text(`${error.phase==="execution"?"Execution":"Compilation"}${error.sourceFile?` (${error.sourceFile})`:""}${error.line?` - Line ${error.line}`:""}: ${error.message}`));document.text("Review the indicated diagnostics. Execution locations refer to generated source when that is the file that ran. Correct the issue and submit again.");}
    heading(9,"Recommendations");files(report.recommendations);
    document.moveDown().font("Helvetica-Bold").text("Verified optimization evidence").font("Helvetica");
    const evidence=report.optimizationEvidence;
    if(!evidence)document.text("Not measured. No verified optimization evidence is available.");
    else {line("Method",evidence.method);line("Transformations",evidence.transformations);line("Measurement unit",evidence.measurement?.unit);line("Before",evidence.measurement?.before);line("After",evidence.measurement?.after);line("Reduction percent",evidence.measurement?.reductionPercent);line("Compiler",evidence.compiler?`${evidence.compiler.name} ${evidence.compiler.version}`:null);line("Compiler options",evidence.compiler?evidence.compiler.options.join(' ')||"None":null);line("Optimizer primary output bytes",evidence.artifactBytes);line("DCE status",evidence.deadCodeElimination.status);line("DCE method",evidence.deadCodeElimination.method);line("Removed statements",evidence.deadCodeElimination.removedStatements);line("Removed instructions",evidence.deadCodeElimination.removedInstructions);}
    line("Runtime speedup","Not measured");
    if(report.optimizations.length){document.text("Optimizations made:");report.optimizations.forEach(item=>document.text(`${item.line?`Line ${item.line}: `:""}${item.description}`));}
    if(document.y>document.page.height-document.page.margins.bottom-150)document.addPage();
    if(report.jobId){document.moveDown().font("Helvetica-Bold").text("Compilation identity and measured totals").font("Helvetica");line("Job",report.jobId);for(const [name,value] of Object.entries(report.measurements??{})){line(name,typeof value==='object'?JSON.stringify(value):value);}}
    heading(10,"Final Result");document.font("Helvetica-Bold").text(report.finalResult.status).font("Helvetica").text(report.finalResult.message).text("Available artifacts:");files(report.finalResult.availableArtifacts);document.moveDown().text("Report Generated By OmniCompile Core");
    document.end();
  });
}
