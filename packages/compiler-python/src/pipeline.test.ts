import {mkdtemp,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawn} from "node:child_process";
import {describe,expect,it} from "vitest";
import {compilePython,PythonFrontendError} from "./pipeline.js";

describe("Python compiler and optimization pipeline",()=>{
  it("uses CPython AST analysis and folds safe constant expressions",async()=>{const result=await compilePython("value = 20 + 22\nif False:\n    value = 0\nraise SystemExit(value)\n");expect(result.representation).toBe("CPython AST + bytecode");expect(result.optimizedSource).toContain("value = 42");expect(result.optimizedSource).toContain("if False");expect(result.metrics.nodesRemoved).toBeGreaterThan(0);});
  it("preserves assertions, docstrings and unreachable local bindings in source and bytecode",async()=>{
    const source='"module doc"\nx = 9\ndef f():\n    "function doc"\n    if False:\n        x = 1\n    return x\ntry:\n    f()\nexcept UnboundLocalError:\n    print("local")\nprint(__doc__, f.__doc__)\nassert False, "kept"\n';
    const result=await compilePython(source);
    const workspace=await mkdtemp(join(tmpdir(),"python-semantics-"));
    try{
      const paths=[join(workspace,"original.py"),join(workspace,"final.py"),join(workspace,result.artifactName)] as const;
      await Promise.all([writeFile(paths[0],source),writeFile(paths[1],result.optimizedSource),writeFile(paths[2],result.bytecode)]);
      const run=(path:string)=>new Promise<{code:number;stdout:string;stderr:string}>((resolve,reject)=>{const child=spawn(process.env.PYTHON_EXECUTABLE??"python",[path],{windowsHide:true});let stdout="",stderr="";child.stdout.on("data",chunk=>stdout+=chunk);child.stderr.on("data",chunk=>stderr+=chunk);child.on("error",reject);child.on("close",code=>resolve({code:code??-1,stdout,stderr}));});
      const executions=await Promise.all(paths.map(run));
      for(const execution of executions){expect(execution.code).toBe(1);expect(execution.stdout.replaceAll("\r\n","\n")).toBe("local\nmodule doc function doc\n");expect(execution.stderr).toContain("AssertionError: kept");}
    }finally{await rm(workspace,{recursive:true,force:true});}
  });
  it("retains huge exponentiation and repetition without computing them",async()=>{const result=await compilePython("a = 2 ** 1000000000\nb = 'x' * 1000000000\n");expect(result.optimizedSource).toContain("2 ** 1000000000");expect(result.optimizedSource).toContain("'x' * 1000000000");},5000);
  it("sanitizes unavailable-toolchain diagnostics",async()=>{await expect(compilePython("pass", "C:/private/internal/missing-python.exe")).rejects.toThrow(/PY_TOOLCHAIN/);await expect(compilePython("pass", "C:/private/internal/missing-python.exe")).rejects.not.toThrow(/private|missing-python/);});
  it("loads genuine bytecode with the selected filename and matches final source",async()=>{
    const result=await compilePython("print(-7 + 2)\n",undefined,"selected.py"),workspace=await mkdtemp(join(tmpdir(),"python-filename-"));
    try{
      expect(result.artifactName).toBe("selected.pyc");
      const path=join(workspace,result.artifactName),sourcePath=join(workspace,"final.py");await writeFile(path,result.bytecode);await writeFile(sourcePath,result.optimizedSource);
      const inspected=await new Promise<string>((resolve,reject)=>{const child=spawn(process.env.PYTHON_EXECUTABLE??"python",["-I","-S","-c","import marshal,sys,pathlib; c=marshal.loads(pathlib.Path(sys.argv[1]).read_bytes()[16:]); print(c.co_filename); assert c.co_code == compile(pathlib.Path(sys.argv[2]).read_text(), 'selected.py', 'exec', optimize=0).co_code; exec(c)",path,sourcePath],{windowsHide:true});let output="";child.stdout.on("data",chunk=>output+=chunk);child.on("error",reject);child.on("close",code=>code===0?resolve(output):reject(new Error("Artifact inspection failed")));});
      expect(inspected.replaceAll("\r\n","\n")).toBe("selected.py\n-5\n");
      expect(result.optimizations?.length).toBeGreaterThan(0);
    }finally{await rm(workspace,{recursive:true,force:true});}
  });
  it("rejects invalid original control flow before transformations",async()=>{for(const source of ["if False:\n    return 1\n", "while False:\n    continue\nelse:\n    break\n"]){await expect(compilePython(source)).rejects.toThrow(/PY_SYNTAX/);}});
  it("preserves false-while local bindings and negative expressions",async()=>{
    const result=await compilePython("x = 3\ndef f():\n    while False:\n        x = 4\n    return x\nprint(-5 + 2, 2 ** -3, 'a' * -2)\n");expect(result.optimizedSource).toContain("while False");expect(result.optimizedSource).toContain("2 ** -3");expect(result.optimizedSource).toContain("'a' * -2");
  });
  it("rejects oversized source before starting a toolchain",async()=>{await expect(compilePython("#".repeat(1_000_001),"missing")).rejects.toThrow(/PY_SOURCE_TOO_LARGE/);});
  it("preserves future annotation strings for modules, arguments and returns",async()=>{
    const source="from __future__ import annotations\nx: (1  +   2) = 3\ndef f(a: (4   + 5), b: list[\"quoted\"] = None) -> (6   + 7):\n    return a\nprint(__annotations__)\nprint(f.__annotations__)\n";
    const result=await compilePython(source),workspace=await mkdtemp(join(tmpdir(),"python-annotations-"));
    try{
      const original=join(workspace,"original.py"),final=join(workspace,"final.py");await writeFile(original,source);await writeFile(final,result.optimizedSource);
      const run=(path:string)=>new Promise<string>((resolve,reject)=>{const child=spawn(process.env.PYTHON_EXECUTABLE??"python",[path],{windowsHide:true});let stdout="";child.stdout.on("data",chunk=>stdout+=chunk);child.on("error",reject);child.on("close",code=>code===0?resolve(stdout):reject(new Error("Fixture execution failed")));});
      expect(await run(final)).toBe(await run(original));
    }finally{await rm(workspace,{recursive:true,force:true});}
  });
  it("preserves accepted uppercase and long filenames in artifact metadata",async()=>{
    for(const name of ["Selected.PY",`${"a".repeat(201)}.py`]){
      const result=await compilePython("pass\n",undefined,name);
      expect(result.artifactName).toBe(name.slice(0,-3)+".pyc");
      const filename=await new Promise<string>((resolve,reject)=>{const child=spawn(process.env.PYTHON_EXECUTABLE??"python",["-I","-S","-c","import base64,marshal,sys; print(marshal.loads(base64.b64decode(sys.stdin.read())[16:]).co_filename)"],{windowsHide:true});let stdout="";child.stdout.on("data",chunk=>stdout+=chunk);child.on("error",reject);child.on("close",code=>code===0?resolve(stdout.trim()):reject(new Error("Metadata inspection failed")));child.stdin.end(result.bytecode.toString("base64"));});
      expect(filename).toBe(name);
    }
  });
  it("produces a genuine runnable CPython bytecode artifact",async()=>{const result=await compilePython("raise SystemExit(7)\n"),workspace=await mkdtemp(join(tmpdir(),"omnicompile-python-")),path=join(workspace,result.artifactName);try{await writeFile(path,result.bytecode);const exitCode=await new Promise<number>((resolve,reject)=>{const child=spawn(process.env.PYTHON_EXECUTABLE??"python",[path],{windowsHide:true});child.on("error",reject);child.on("close",code=>resolve(code??-1));});expect(exitCode).toBe(7);expect(result.bytecode.subarray(0,4).equals(Buffer.from([0,0,0,0]))).toBe(false);}finally{await rm(workspace,{recursive:true,force:true});}},30_000);
  it("returns source-positioned syntax diagnostics",async()=>{await expect(compilePython("def broken(:\n pass\n")).rejects.toBeInstanceOf(PythonFrontendError);await expect(compilePython("def broken(:\n pass\n")).rejects.toThrow(/PY_SYNTAX.*at 1:/);});
});
