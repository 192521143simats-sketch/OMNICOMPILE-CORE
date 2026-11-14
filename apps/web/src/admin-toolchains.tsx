import React,{useState} from "react";
import {api} from "./api.js";

type ExecutionHistory={
  provider:"docker"|"kubernetes";
  items:Array<{id:string;language:string;kind:string;state:string;createdAt:string;finishedAt:string|null;runnerDurationMs?:number|null}>;
};
type Toolchains = {
  status:"NOT_CONFIGURED"|"REACHABLE";
  toolchains:Array<{language:"c"|"python"|"java";reference:string;available:boolean|null;imageId:string|null}>;
};

export function AdminToolchains(){
  const [report,setReport]=useState<Toolchains>();
  const [error,setError]=useState("");
  const [pending,setPending]=useState(false);
  const [history,setHistory]=useState<ExecutionHistory>();
  const [historyError,setHistoryError]=useState("");
  const [checkingHistory,setCheckingHistory]=useState(false);
  async function refreshHistory(cancelId?:string){
    setCheckingHistory(true);
    setHistoryError("");
    try{
      if(cancelId)await api("/api/admin/executions/"+encodeURIComponent(cancelId)+"/cancel",{method:"POST"});
      setHistory(await api("/api/admin/executions"));
    }catch(cause){setHistoryError(cause instanceof Error?cause.message:"Execution history is unavailable.");}
    finally{setCheckingHistory(false);}
  }
  async function refresh(){
    setPending(true);
    setError("");
    setReport(undefined);
    try{setReport(await api("/api/admin/toolchains"));}
    catch(cause){setError(cause instanceof Error?cause.message:"Toolchain status is unavailable.");}
    finally{setPending(false);}
  }
  return <section className="card" aria-label="Execution toolchains">
    <h2>Execution toolchains</h2>
    <button className="secondary" disabled={pending} type="button" onClick={()=>void refresh()}>
      {pending?"Checking toolchains…":"Check toolchains"}
    </button>
    {error&&<p role="alert">{error}</p>}
    {report?.status==="NOT_CONFIGURED"&&<p role="status">No execution service is configured.</p>}
    {report?.status==="REACHABLE"&&<ul aria-label="Reported toolchains">{report.toolchains.map(item=><li key={item.language}>
      <strong>{item.language.toUpperCase()}</strong> · {item.available===null?"Configured · pull not checked":item.available?"Available":"Unavailable"} · <code>{item.reference}</code>
    </li>)}</ul>}
    <h3>Execution history</h3>
    <button className="secondary" disabled={checkingHistory} type="button" onClick={()=>void refreshHistory()}>
      {checkingHistory?"Checking executions…":"Refresh executions"}
    </button>
    {historyError&&<p role="alert">{historyError}</p>}
    {history?.provider==="docker"&&<p role="status">The Docker provider does not persist execution history.</p>}
    {history?.provider==="kubernetes"&&history.items.length===0&&<p role="status">No executions recorded.</p>}
    {history?.items.length?<ul aria-label="Recent executions">{history.items.map(item=><li key={item.id}>
      <code>{item.id}</code> · {item.language.toUpperCase()} · {item.kind} · {item.state} · {new Date(item.createdAt).toLocaleString()}
      {item.runnerDurationMs!=null&&<> · Runner lifetime {item.runnerDurationMs.toLocaleString()} ms</>}
      {["PROVISIONING","RUNNING"].includes(item.state)&&<button type="button" className="secondary" disabled={checkingHistory}
        onClick={()=>void refreshHistory(item.id)}>Cancel execution</button>}
    </li>)}</ul>:null}
  </section>;
}
