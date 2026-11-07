import {describe,it,expect,vi} from "vitest";
import {spawn} from 'node:child_process';
import {executeIsolated} from "./isolated-execution.js";
import {requestDockerJob} from '@omnicompile/orchestration';

vi.mock('node:child_process',async original=>({
  ...await original<typeof import('node:child_process')>(),
  spawn:vi.fn(()=>{throw new Error('Coordinator host process execution is forbidden.');})
}));

describe.skipIf(process.env.OMNICOMPILE_SANDBOX_TEST!=="1")("real isolated execution",()=>{
  it("does not publish output from explicitly cancelled program execution",async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),1000);
    try{const result=await executeIsolated({language:"python",sourceName:"cancel.py",generatedSource:"while True: pass",artifact:null,signal:controller.signal});expect(controller.signal.aborted).toBe(true);expect(result.execution.status).not.toBe("SUCCEEDED");expect(result.artifact).toBeUndefined();}finally{clearTimeout(timer);}
  },60000);
  it("keeps dotted C filenames usable and refuses oversized Linux artifacts",async()=>{
    const dotted=await executeIsolated({language:"c",sourceName:"invoice.v1.c",generatedSource:"int main(void){return 0;}",artifact:null});expect(dotted.execution.status).toBe("SUCCEEDED");expect(dotted.artifact?.fileName).toBe("invoice_v1-linux");
    const bounded=await executeIsolated({language:"c",sourceName:"bounded.c",generatedSource:"const char payload[4000000] = {[0]=1,[3999999]=2}; int main(void){return payload[0]==1?0:1;}",artifact:null});expect(bounded.execution.status).toBe("SUCCEEDED");expect(bounded.artifact!.bytes.length).toBeGreaterThan(4000000);
    const large=await executeIsolated({language:"c",sourceName:"large.c",generatedSource:"const char payload[9000000] = {[0]=1,[8999999]=2}; int main(void){return payload[0]==1?0:1;}",artifact:null});expect(large.execution.status).toBe("UNAVAILABLE");expect(large.artifact).toBeUndefined();
  },60000);
  it("fails closed when the execution broker is not configured",async()=>{
    const previous=process.env.OMNICOMPILE_EXECUTOR_URL;delete process.env.OMNICOMPILE_EXECUTOR_URL;
    try{const result=await executeIsolated({language:"python",sourceName:"missing.py",generatedSource:'print("not executed")',artifact:null});expect(result.execution.status).toBe("UNAVAILABLE");expect(result.execution.stdout).toBe("");}finally{if(previous===undefined)delete process.env.OMNICOMPILE_EXECUTOR_URL;else process.env.OMNICOMPILE_EXECUTOR_URL=previous;}
  },60000);
  it("prevents the submitted program from writing to its controller output",async()=>{
    const result=await executeIsolated({language:"python",sourceName:"integrity.py",generatedSource:'import os\ntry:\n fd=os.open("/proc/"+str(os.getppid())+"/fd/1",os.O_WRONLY)\n os.write(fd,b"FORGED")\n raise AssertionError("controller output writable")\nexcept PermissionError: pass\nprint("protected")',artifact:null});expect(result.execution.status).toBe("SUCCEEDED");expect(result.execution.stdout).toBe("protected\n");
  },60000);
  it("executes the genuine Java JAR and preserves supplied standard input",async()=>{
    const compiled=await requestDockerJob<{result:{generatedSource:string;fileName:string;artifactBase64:string}}>({kind:'task',language:'java',payload:{operation:'java_compile',sourceName:'Main.java',source:'public class Main { public static void main(String[] args){System.out.println("java");} }'}});
    const java=compiled.result;
    const result=await executeIsolated({language:"java",sourceName:"Main.java",generatedSource:java.generatedSource,artifact:{artifactType:"JAR",fileName:java.fileName,mediaType:"application/java-archive",bytes:Buffer.from(java.artifactBase64,'base64')},runnableJar:true});expect(result.execution.status).toBe("SUCCEEDED");expect(result.execution.stdout).toBe("java\n");
    const python=await executeIsolated({language:"python",sourceName:"input.py",generatedSource:"print(int(input())+1)",artifact:null,input:"41\n"});expect(python.execution.stdout).toBe("42\n");expect(python.execution.input).toBe("41\n");
  },60000);
  it("runs actual Python and measures output without host secrets",async()=>{
    const result=await executeIsolated({language:"python",sourceName:"invoice.py",generatedSource:'import os\nprint(2+3)\nassert "DB_PASSWORD" not in os.environ\n',artifact:null});
    expect(result.execution.status).toBe("SUCCEEDED");expect(result.execution.stdout).toBe("5\n");expect(result.execution.durationMs).toBeGreaterThan(0);expect(result.execution.peakMemoryBytes).toBeNull();
  },60000);
  it("reports real runtime errors rather than compiler errors",async()=>{
    const result=await executeIsolated({language:"python",sourceName:"invoice.py",generatedSource:"print(1/0)",artifact:null});expect(result.execution.status).toBe("FAILED");expect(result.execution.stderr).toContain("ZeroDivisionError");expect(result.execution.stderr).toContain('File "compiled_invoice.py", line 1');expect(result.execution.exitCode).toBe(1);
  },60000);
  it("terminates a nonterminating program",async()=>{
    const result=await executeIsolated({language:"python",sourceName:"loop.py",generatedSource:"while True: pass",artifact:null});expect(result.execution.status).toBe("TIMED_OUT");
  },60000);
  it("bounds an output flood",async()=>{
    const result=await executeIsolated({language:"python",sourceName:"flood.py",generatedSource:'while True: print("x"*1000, flush=True)',artifact:null});expect(result.execution.status).toBe("OUTPUT_LIMIT");expect(Buffer.byteLength(result.execution.stdout)+Buffer.byteLength(result.execution.stderr)).toBeLessThanOrEqual(65536);
  },60000);
  it("enforces non-root, read-only filesystem and blocked network",async()=>{
    const result=await executeIsolated({language:"python",sourceName:"security.py",generatedSource:'import os,socket\nassert os.getuid()==1000\ntry:\n open("/opt/escape","w").write("x")\n raise AssertionError("write allowed")\nexcept OSError: pass\ntry:\n socket.create_connection(("1.1.1.1",443),timeout=1)\n raise AssertionError("network allowed")\nexcept OSError: pass\nprint("isolated")',artifact:null});expect(result.execution.status).toBe("SUCCEEDED");expect(result.execution.stdout).toBe("isolated\n");
  },60000);
  it("produces and actually executes a Linux C output without relabelling Windows bytes",async()=>{
    const result=await executeIsolated({language:"c",sourceName:"program.c",generatedSource:'#include <stdio.h>\nint main(void){puts("five");return 0;}',artifact:{artifactType:"EXECUTABLE",fileName:"program.exe",mediaType:"application/octet-stream",bytes:Buffer.from("MZ")} });expect(result.execution.status).toBe("SUCCEEDED");expect(result.execution.stdout).toBe("five\n");expect(result.artifact?.bytes.subarray(0,4)).toEqual(Buffer.from([127,69,76,70]));expect(result.execution.artifactName).toBe("program-linux");
  },60000);
});


describe('execution broker configuration',()=>{
  it('returns honest unavailable evidence without a configured broker',async()=>{
    const previous=process.env.OMNICOMPILE_EXECUTOR_URL;
    delete process.env.OMNICOMPILE_EXECUTOR_URL;
    try{
      const result=await executeIsolated({language:'python',sourceName:'sample.py',generatedSource:'print(42)',artifact:null});
      expect(result.execution.status).toBe('UNAVAILABLE');
      expect(result.execution.stdout).toBe('');
      expect(result.execution.durationMs).toBeNull();
      expect(result.execution.peakMemoryBytes).toBeNull();
      expect(result.artifact).toBeUndefined();
      expect(spawn).not.toHaveBeenCalled();
    }finally{if(previous===undefined)delete process.env.OMNICOMPILE_EXECUTOR_URL;else process.env.OMNICOMPILE_EXECUTOR_URL=previous;}
  });
});
