import React,{useEffect,useRef,useState} from "react";
import {projectMaxFiles,projectMaxSourceBytes,type ProjectInput,type ProjectAnalysis} from "@omnicompile/contracts";
import {api} from "./api.js";

const maxFiles=projectMaxFiles,maxBytes=projectMaxSourceBytes;
export function ProjectAnalysisPanel({language}:{language:ProjectInput["language"]}){
  const [files,setFiles]=useState<ProjectInput["files"]>([]);
  const [result,setResult]=useState<ProjectAnalysis>();
  const [error,setError]=useState("");
  const [entryPoint,setEntryPoint]=useState("");
  const [ignoredCount,setIgnoredCount]=useState(0);
  const [reading,setReading]=useState(false),[pending,setPending]=useState(false);
  const generation=useRef(0);
  const input=useRef<HTMLInputElement>(null),folderInput=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    generation.current++;
    setFiles([]);setIgnoredCount(0);setEntryPoint("");setResult(undefined);setError("");setReading(false);setPending(false);
    if(input.current)input.current.value="";
    if(folderInput.current)folderInput.current.value="";
    return ()=>{generation.current++;};
  },[language]);
  async function select(event:React.ChangeEvent<HTMLInputElement>,folder=false){
    const list=event.target.files,current=++generation.current;
    if(folder&&input.current)input.current.value="";
    if(!folder&&folderInput.current)folderInput.current.value="";
    setFiles([]);setIgnoredCount(0);setEntryPoint("");setResult(undefined);setError("");setPending(false);setReading(false);
    if(!list?.length)return;
    try{
      if(list.length>(folder?4096:maxFiles))throw new Error(folder?"Choose a folder with at most 4096 files.":"Choose at most 32 project files.");
      let selected=Array.from(list);
      const extension=language==="c"?/\.(c|h)$/i:language==="python"?/\.py$/i:/\.java$/i;
      if(folder){
        selected=selected.filter(file=>extension.test(file.webkitRelativePath||file.name));
        setIgnoredCount(list.length-selected.length);
        if(!selected.length)throw new Error("The folder contains no source files for the selected language.");
      }
      if(selected.length>maxFiles)throw new Error("Choose at most 32 project files.");
      if(selected.reduce((sum,file)=>sum+file.size,0)>maxBytes)throw new Error("Project files must total at most 1 MB of UTF-8 source.");
      let paths=selected.map(file=>file.webkitRelativePath||file.name);
      if(folder){
        const root=paths[0]!.split("/")[0]!+"/";
        if(!paths.every(path=>path.startsWith(root)))throw new Error("Choose a single project folder.");
        paths=paths.map(path=>path.slice(root.length));
      }
      if(paths.some(path=>!extension.test(path)))throw new Error("All project files must match the selected language (C accepts .c and .h).");
      if(new Set(paths).size!==paths.length)throw new Error("Project file paths must be unique.");
      if(paths.some(path=>path.startsWith("/")||path.includes("\\")||path.split("/").some(part=>!part||part==="."||part==="..")))throw new Error("Choose files with safe relative paths.");
      setReading(true);
      const loaded:ProjectInput["files"]=[];
      let bytes=0;
      for(const [index,file] of selected.entries()){
        const content=await file.text();
        if(current!==generation.current)return;
        bytes+=new TextEncoder().encode(content).byteLength;
        if(bytes>maxBytes)throw new Error("Project files must total at most 1 MB of UTF-8 source.");
        loaded.push({path:paths[index]!,content});
      }
      if(current===generation.current)setFiles(loaded);
    }catch(cause){if(current===generation.current)setError(cause instanceof Error?cause.message:"Project files could not be read.");}
    finally{if(current===generation.current)setReading(false);}
  }
  async function analyze(){
    if(!files.length||pending||reading)return;
    const current=++generation.current;
    setPending(true);setResult(undefined);setError("");
    const body:ProjectInput={language,files,...(entryPoint?{entryPoint}:{})};
    try{
      const report:ProjectAnalysis=await api("/api/compilations/project-analysis",{method:"POST",body:JSON.stringify(body)});
      if(current===generation.current)setResult(report);
    }catch(cause){if(current===generation.current)setError(cause instanceof Error?cause.message:"Project analysis is unavailable.");}
    finally{if(current===generation.current)setPending(false);}
  }
  return <section aria-label="Project analysis">
    <h3>Multi-file project analysis</h3>
    <p>Analysis only. Review dependencies and diagnostics before toolchain validation. Compilation above uses one source file.</p>
    <label>Project files (32 files, 1 MB total)<input ref={input} type="file" multiple accept={language==="c"?".c,.h":language==="python"?".py":".java"} onChange={event=>void select(event)}/></label>
    <label>Project folder (includes nested source files)<input ref={folderInput} type="file" multiple {...{webkitdirectory:""}} onChange={event=>void select(event,true)}/></label>
    <small>Folder selection includes source files for the selected language and ignores other files. Paths are relative to the selected project folder.</small>
    {ignoredCount>0&&<p role="status">{ignoredCount} other files ignored; their contents are not read or submitted.</p>}
    {reading&&<p role="status">Reading project files...</p>}
    {files.length>0&&<ul aria-label="Selected project files">{files.map(file=><li key={file.path}><code>{file.path}</code></li>)}</ul>}
    {files.length>0&&<label>Entry source file (optional)<select aria-label="Entry source file" value={entryPoint} onChange={event=>{
      generation.current++;setEntryPoint(event.target.value);setResult(undefined);setPending(false);setError("");
    }}><option value="">No explicit entry source</option>{files.filter(file=>language!=="c"||file.path.endsWith(".c")).map(file=><option key={file.path} value={file.path}>{file.path}</option>)}</select></label>}
    <button type="button" className="secondary" disabled={!files.length||reading||pending} onClick={()=>void analyze()}>{pending?"Analyzing project...":"Analyze project"}</button>
    {error&&<p role="alert">{error}</p>}
    {result&&<>
      <p role="status">{result.status==="INVALID"?"Invalid project":"Requires toolchain validation"} - {result.sourceBytes.toLocaleString()} UTF-8 source bytes</p>
      <h4>Dependency graph</h4>
      <ul aria-label="Project dependencies">{result.files.map(file=><li key={file.path}>
        <code>{file.path}</code> - Project dependencies: {file.dependencies.join(", ")||"none reported"}; External dependencies: {file.externalDependencies.join(", ")||"none reported"}
      </li>)}</ul>
      <h4>Dependency groups</h4>
      <p>Groups reflect detected references; they do not establish independent compilation or safe parallel execution.</p>
      <ol aria-label="Dependency groups">{result.groups.map((group,index)=><li key={index}>{group.join(", ")}</li>)}</ol>
      <h4>Analysis diagnostics</h4>
      {result.diagnostics.length?<ul aria-label="Analysis diagnostics">{result.diagnostics.map((item,index)=><li key={index}>{item.severity} - {item.code}{item.path?` - ${item.path}`:""}: {item.message}</li>)}</ul>:<p>No analysis diagnostics reported.</p>}
      <ul aria-label="Analysis notes">{result.notes.map((note,index)=><li key={index}>{note}</li>)}</ul>
    </>}
  </section>;
}
