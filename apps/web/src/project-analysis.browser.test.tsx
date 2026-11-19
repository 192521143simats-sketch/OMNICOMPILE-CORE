// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
import {ProjectAnalysisPanel} from "./project-analysis.js";
import {api} from "./api.js";
vi.mock("./api.js",()=>({api:vi.fn()}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const response={language:"c",sourceBytes:25,files:[{path:"src/main.c",dependencies:["include/lib.h"],externalDependencies:["stdio.h"]},{path:"include/lib.h",dependencies:[],externalDependencies:[]}],groups:[["include/lib.h"],["src/main.c"]],diagnostics:[{severity:"warning",code:"VALIDATE",message:"Validate with compiler",path:"src/main.c"}],status:"REQUIRES_TOOLCHAIN_VALIDATION",notes:["Syntax requires native validation"]};
function file(name:string,content="int main(void){}",relative="",size=content.length){return {name,size,webkitRelativePath:relative,text:vi.fn(async()=>content)};}
function setup(){const host=document.createElement("div"),root=createRoot(host);return {host,root,async select(files:ReturnType<typeof file>[]){const input=host.querySelector('input[type=file]')!;Object.defineProperty(input,"files",{configurable:true,value:files});await act(async()=>input.dispatchEvent(new Event("change",{bubbles:true})));},async analyze(){await act(async()=>Array.from(host.querySelectorAll("button")).find(x=>x.textContent==="Analyze project")!.click());}};}
it("posts selected relative paths and renders actual graph, groups and diagnostics",async()=>{
 vi.mocked(api).mockReset().mockResolvedValue(response);
 const t=setup();try{
 await act(async()=>t.root.render(<ProjectAnalysisPanel language="c"/>));
 await t.select([file("main.c","#include x","src/main.c"),file("lib.h","int x;","include/lib.h")]);await t.analyze();
 expect(api).toHaveBeenCalledWith("/api/compilations/project-analysis",expect.objectContaining({method:"POST",body:JSON.stringify({language:"c",files:[{path:"src/main.c",content:"#include x"},{path:"include/lib.h",content:"int x;"}]})}));
 expect(t.host.textContent).toContain("Analysis only");expect(t.host.textContent).toContain("Requires toolchain validation");
 expect(t.host.textContent).toContain("stdio.h");expect(t.host.textContent).toContain("Validate with compiler");expect(t.host.textContent).toContain("Syntax requires native validation");
 expect(t.host.querySelector('[aria-label="Dependency groups"]')?.children).toHaveLength(2);
 }finally{await act(async()=>t.root.unmount());}
});
it("rejects count, aggregate size and mixed languages before reading files",async()=>{
 vi.mocked(api).mockReset();const t=setup();try{
 await act(async()=>t.root.render(<ProjectAnalysisPanel language="c"/>));
 for(const files of [[file("big.c","", "",1_000_001)],Array.from({length:33},(_,i)=>file(i+".c")),[file("main.c"),file("other.py")]]){
 await t.select(files);expect(files.every(f=>f.text.mock.calls.length===0)).toBe(true);expect(t.host.querySelector('[role="alert"]')).not.toBeNull();}
 expect(api).not.toHaveBeenCalled();
 }finally{await act(async()=>t.root.unmount());}
});
it("invalidates pending analysis on language change and renders request failures",async()=>{
 let complete:(value:unknown)=>void=()=>{};
 vi.mocked(api).mockReset().mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;})).mockRejectedValueOnce(new Error("Analysis unavailable"));
 const t=setup();try{
 await act(async()=>t.root.render(<ProjectAnalysisPanel language="c"/>));await t.select([file("main.c")]);await t.analyze();
 expect(t.host.textContent).toContain("Analyzing project");
 await act(async()=>t.root.render(<ProjectAnalysisPanel language="python"/>));
 await act(async()=>complete(response));expect(t.host.textContent).not.toContain("Requires toolchain validation");expect(t.host.textContent).not.toContain("main.c");
 await t.select([file("main.py","print(1)")]);await t.analyze();expect(t.host.textContent).toContain("Analysis unavailable");
 }finally{await act(async()=>t.root.unmount());}
});
it("ignores a stale file read when another selection replaces it",async()=>{
 const t=setup();let finish:(value:string)=>void=()=>{};const slow=file("old.c");slow.text.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 try{await act(async()=>t.root.render(<ProjectAnalysisPanel language="c"/>));
 const input=t.host.querySelector('input[type=file]')!;Object.defineProperty(input,"files",{configurable:true,value:[slow]});
 await act(async()=>input.dispatchEvent(new Event("change",{bubbles:true})));
 await t.select([file("new.c")]);await act(async()=>finish("old contents"));
 expect(t.host.textContent).toContain("new.c");expect(t.host.textContent).not.toContain("old.c");
 }finally{await act(async()=>t.root.unmount());}
});

it("normalizes only directory selections to the selected project root",async()=>{
 vi.mocked(api).mockReset().mockResolvedValue({...response,language:"python"});const t=setup();try{
 await act(async()=>t.root.render(<ProjectAnalysisPanel language="python"/>));
 const folder=t.host.querySelector('input[webkitdirectory]')!;
 Object.defineProperty(folder,"files",{configurable:true,value:[file("main.py","import pkg.util","example/main.py"),file("util.py","x=1","example/pkg/util.py")]});
 await act(async()=>folder.dispatchEvent(new Event("change",{bubbles:true})));await t.analyze();
 expect(JSON.parse(vi.mocked(api).mock.calls[0]![1]!.body as string).files.map((item:any)=>item.path)).toEqual(["main.py","pkg/util.py"]);
 }finally{await act(async()=>t.root.unmount());}
});

it("sends an optional entry source path and excludes C headers from the selector",async()=>{
 vi.mocked(api).mockReset().mockResolvedValue(response);const t=setup();try{
 await act(async()=>t.root.render(<ProjectAnalysisPanel language="c"/>));await t.select([file("main.c"),file("lib.h")]);
 const entry=t.host.querySelector('select[aria-label="Entry source file"]') as HTMLSelectElement;
 expect(Array.from(entry.options).map(option=>option.value)).toEqual(["","main.c"]);
 await act(async()=>{entry.value="main.c";entry.dispatchEvent(new Event("change",{bubbles:true}));});await t.analyze();
 expect(JSON.parse(vi.mocked(api).mock.calls[0]![1]!.body as string).entryPoint).toBe("main.c");
 }finally{await act(async()=>t.root.unmount());}
});

it("filters folder non-source files before source budgets without reading ignored contents",async()=>{
 vi.mocked(api).mockReset().mockResolvedValue(response);const t=setup();try{
 await act(async()=>t.root.render(<ProjectAnalysisPanel language="c"/>));
 const ignored=Array.from({length:40},(_,i)=>file("README"+i+".md","","example/README"+i+".md",2_000_000));
 for(const item of ignored)item.text.mockRejectedValue(new Error("Ignored file must not be read"));
 const folder=t.host.querySelector('input[webkitdirectory]')!;
 Object.defineProperty(folder,"files",{configurable:true,value:[file("main.c","int main(void){}","example/src/main.c"),...ignored]});
 await act(async()=>folder.dispatchEvent(new Event("change",{bubbles:true})));
 expect(ignored.every(item=>item.text.mock.calls.length===0)).toBe(true);
 expect(t.host.textContent).toContain("40 other files ignored");await t.analyze();
 expect(JSON.parse(vi.mocked(api).mock.calls[0]![1]!.body as string).files.map((item:any)=>item.path)).toEqual(["src/main.c"]);
 }finally{await act(async()=>t.root.unmount());}
});
it("bounds folder metadata entries before enumerating or reading contents",async()=>{
 const t=setup();try{
 await act(async()=>t.root.render(<ProjectAnalysisPanel language="c"/>));
 const folder=t.host.querySelector('input[webkitdirectory]')!;
 const metadata={length:4097,[Symbol.iterator](){throw new Error("Oversized folder must not be enumerated");}};
 Object.defineProperty(folder,"files",{configurable:true,value:metadata});
 await act(async()=>folder.dispatchEvent(new Event("change",{bubbles:true})));
 expect(t.host.textContent).toContain("4096");
 }finally{await act(async()=>t.root.unmount());}
});
