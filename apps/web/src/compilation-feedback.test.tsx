import "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,it,expect} from "vitest";
import {CompilationFeedback,needsCompilationUpdate} from "./compilation-feedback.js";
describe("compiler result panel",()=>{
  it('shows persisted line and column while the diagnostic report is loading',()=>{
    const html=renderToStaticMarkup(<CompilationFeedback job={{status:'FAILED',error:'Line 3, column 7: expected expression'}} report={null} error=""/>);
    expect(html).toContain('Line 3, column 7');
    expect(html).not.toContain('Source location unavailable');
  });
  it('labels legacy infrastructure failures with no provided source location',()=>{
    const html=renderToStaticMarkup(<CompilationFeedback job={{status:'FAILED',error:'Compiler service unavailable'}} report={null} error=""/>);
    expect(html).toContain('Source location unavailable');
    expect(html).not.toContain('Line 1');
  });
  it('shows report line and column and explicitly labels unavailable source positions',()=>{
    const report={programInformation:{errors:2,warnings:0},errors:[{phase:'compilation',sourceFile:'main.c',line:3,column:7,message:'expected expression'},
      {phase:'compilation',line:null,column:null,message:'Compiler unavailable'}]};
    const html=renderToStaticMarkup(<CompilationFeedback job={{status:'FAILED',error:'Compiler failure'}} report={report} error=""/>);
    expect(html).toContain('Line 3, column 7');
    expect(html).toContain('Source location unavailable');
  });
  it("does not keep polling a cancelled job for artifacts that must never be published",()=>{
    expect(needsCompilationUpdate({status:"CANCELLED",artifacts:[]})).toBe(false);
    const html=renderToStaticMarkup(<CompilationFeedback job={{status:"CANCELLED"}} report={null} error="" onCancel={async()=>{}}/>);
    expect(html).toContain("Compilation cancelled");expect(html).not.toContain("Cancel compilation</button>");
  });
  it("continues fetching a failed job until its diagnostic artifact is available",()=>{
    expect(needsCompilationUpdate({status:"FAILED",artifacts:[]})).toBe(true);
    expect(needsCompilationUpdate({status:"FAILED",artifacts:[{artifactType:"BUILD_REPORT_JSON"}]})).toBe(false);
    expect(needsCompilationUpdate({status:"DISTRIBUTING",artifacts:[]})).toBe(true);
    expect(needsCompilationUpdate(null)).toBe(false);
  });
  it("shows rejected language input in the result panel without claiming execution",()=>{
    const html=renderToStaticMarkup(<CompilationFeedback job={null} report={null} error="Language mismatch: C selected, PYTHON supplied."/>);
    expect(html).toContain("Submission rejected");expect(html).toContain("Language mismatch");expect(html).toContain("No execution was started");expect(html).not.toContain("Program execution: SUCCEEDED");
  });
  it("shows compilation failure even when no runtime evidence exists",()=>{
    const html=renderToStaticMarkup(<CompilationFeedback job={{status:"FAILED",error:"Line 3: undefined variable total"}} report={{programInformation:{compilationErrors:1,executionErrors:0,warnings:2,warningDetails:["Unused quantity","Raw collection"]},errors:[{phase:"compilation",line:3,message:"undefined variable total"}]}} error=""/>);
    expect(html).toContain("execution not performed");expect(html).toContain("Compilation errors: 1");expect(html).toContain("Warnings: 2");expect(html).toContain("Unused quantity");expect(html).toContain("Line 3");
  });
  it("shows runtime failure and actual stderr despite completed compilation",()=>{
    const html=renderToStaticMarkup(<CompilationFeedback job={{status:"COMPLETED",metrics:{execution:{status:"FAILED",message:"Program exited with code 1",stderr:"ZeroDivisionError: division by zero",durationMs:20}}}} report={{programInformation:{compilationErrors:0,executionErrors:1,warnings:0}}} error=""/>);
    expect(html).toContain("Program execution: FAILED");expect(html).toContain("Execution failures: 1");expect(html).toContain("ZeroDivisionError");expect(html).not.toContain("Compilation and Execution Successful");
  });
});
