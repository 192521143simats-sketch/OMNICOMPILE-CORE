import React from "react";
const sourceLocation=(item:any)=>Number.isInteger(item.line)&&item.line>0
  ? `Line ${item.line}${Number.isInteger(item.column)&&item.column>0?`, column ${item.column}`:''}`
  : 'Source location unavailable';

export function needsCompilationUpdate(job:any):boolean {
  if(job?.status==="CANCELLED")return false;
  return Boolean(job&&(!["COMPLETED","FAILED"].includes(job.status)||!job.artifacts?.some((item:any)=>item.artifactType==="BUILD_REPORT_JSON")));
}

/** Show the same persisted diagnostics as the downloadable report. */
export function CompilationFeedback({job,report,error,onCancel}:{job:any;report:any;error:string;onCancel?:()=>Promise<void>}) {
  const [cancelling,setCancelling]=React.useState(false);
  const execution=job?.metrics?.execution??report?.programExecution;
  return <section aria-live="polite" aria-label="Compilation and execution results">
    {onCancel&&job&&!["COMPLETED","FAILED","CANCELLED"].includes(job.status)&&<button disabled={cancelling} onClick={()=>{setCancelling(true);void onCancel().finally(()=>setCancelling(false));}}>{cancelling?"Cancelling…":"Cancel compilation"}</button>}
    {job?.status==="CANCELLED"&&<p role="status">Compilation cancelled. No new output will be published for this job.</p>}
    {error&&<div role="alert" className="error"><h3>Submission rejected</h3><p>{error}</p><p>Correct the source or selected language before submitting again. No execution was started for this submission.</p></div>}
    {job?.status==="FAILED"&&<div role="alert" className="error"><h3>Compilation failed — execution not performed</h3><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{job.error}</pre>{!report&&!/(?:^|\n)(?:Line [1-9]\d*(?:, column [1-9]\d*)?:|Source location unavailable:)/i.test(String(job.error??''))&&<p>Source location unavailable</p>}</div>}
    {report&&<><h3>Diagnostic summary</h3><p>Compilation errors: {report.programInformation.compilationErrors??report.programInformation.errors} · Execution failures: {report.programInformation.executionErrors??0} · Warnings: {report.programInformation.warnings}</p>
      {report.errors?.map((item:any,index:number)=><p key={index}><strong>{item.phase==="execution"?"Execution":"Compilation"}</strong>{item.sourceFile?` (${item.sourceFile})`:""} — {sourceLocation(item)}: {item.message}</p>)}
      {report.programInformation.warningDetails?.map((warning:string,index:number)=><p key={index}>Warning: {warning}</p>)}
    </>}
    {execution&&<><h3>Program execution: {execution.status}</h3><p>{execution.message}</p><dl><dt>Environment</dt><dd>{execution.target??"Not run"}</dd><dt>Executed artifact</dt><dd>{execution.artifactName??"Not run"}</dd><dt>Exit code</dt><dd>{execution.exitCode??"Not available"}</dd><dt>Program runtime (excludes compilation)</dt><dd>{execution.durationMs==null?"Not available":`${(execution.durationMs/1000).toFixed(3)} seconds`}</dd></dl>{execution.stdout&&<><h4>Standard output</h4><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",maxHeight:240,overflow:"auto"}}>{execution.stdout}</pre></>}{execution.stderr&&<><h4>Runtime diagnostics</h4><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",maxHeight:240,overflow:"auto"}}>{execution.stderr}</pre></>}</>}
  </section>;
}
