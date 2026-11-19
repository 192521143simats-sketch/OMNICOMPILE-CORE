import React,{useCallback,useEffect,useRef,useState} from "react";
import {api} from "./api.js";

const failureLabels = {
  PROVISIONING_FAILED: "Provisioning failed",
  EXECUTION_FAILED: "Execution failed",
  RESULT_COLLECTION_FAILED: "Result collection failed",
  DEADLINE_EXCEEDED: "Execution deadline exceeded",
  CANCELLED: "Execution cancelled"
};

type ExecutionHistory={
  provider:"docker"|"kubernetes";
  capacity?:{busy:number;limit:number}|null;
  prewarm?:{enabled:boolean;policy:"fixed"|"demand";observedAt:string;
    slots:Array<{language:"c"|"python"|"java";state:"PROVISIONING"|"IDLE"|"CLAIMED"|"RETIRING";expiresAt:string|null}>}|null;
  items:Array<{
    id:string;language:string;kind:string;state:string;createdAt:string;finishedAt:string|null;
    runnerDurationMs?:number|null;provisioningDurationMs?:number|null;capacityRetryWaitMs?:number|null;
    schedulingDurationMs?:number|null;containerStartupDurationMs?:number|null;
    failureReason?:keyof typeof failureLabels|null;
  }>;
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
  const historyRequestPending=useRef(false);
  const refreshHistory=useCallback(async(cancelId?:string)=>{
    if(historyRequestPending.current)return;
    historyRequestPending.current=true;
    setCheckingHistory(true);
    try{
      if(cancelId)await api("/api/admin/executions/"+encodeURIComponent(cancelId)+"/cancel",{method:"POST"});
      setHistory(await api("/api/admin/executions"));
      setHistoryError("");
    }catch(cause){setHistoryError(cause instanceof Error?cause.message:"Execution history is unavailable.");}
    finally{
      historyRequestPending.current=false;
      setCheckingHistory(false);
    }
  },[]);
  useEffect(()=>{
    const refreshWhenVisible=()=>{if(document.visibilityState==="visible")void refreshHistory();};
    refreshWhenVisible();
    const timer=window.setInterval(refreshWhenVisible,10_000);
    document.addEventListener("visibilitychange",refreshWhenVisible);
    return ()=>{
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange",refreshWhenVisible);
    };
  },[refreshHistory]);
  async function refresh(){
    setPending(true);
    setError("");
    setReport(undefined);
    try{setReport(await api("/api/admin/toolchains"));}
    catch(cause){setError(cause instanceof Error?cause.message:"Toolchain status is unavailable.");}
    finally{setPending(false);}
  }
  const capacity=historyError?null:history?.capacity;
  const prewarm=historyError?null:history?.prewarm;
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
    <p role="status"><strong>Prewarm reservations</strong>  -  {prewarm
      ?`${prewarm.enabled?"Enabled":"Disabled"}  -  ${prewarm.policy} policy`
      :!historyError&&history?.provider==="docker"?"Not applicable to Docker execution":"Unavailable"}</p>
    {prewarm&&<>
      <p>Database observations  -  {new Date(prewarm.observedAt).toLocaleString()}. Reservation states do not report Pod health or readiness.</p>
      {prewarm.slots.length===0?<p>No reservations recorded.</p>:<ul aria-label="Prewarm reservations">{prewarm.slots.map(slot=><li key={slot.language}>
        {slot.language.toUpperCase()}  -  {slot.state}  -  Expires {slot.expiresAt?new Date(slot.expiresAt).toLocaleString():"unavailable"}
      </li>)}</ul>}
    </>}
    <p role="status"><strong>Fixed execution capacity</strong> · {capacity
      ?`${capacity.busy} / ${capacity.limit} busy · ${capacity.limit-capacity.busy} available`
      :checkingHistory?"Checking…":"Unavailable"}</p>
    <button className="secondary" disabled={checkingHistory} type="button" onClick={()=>void refreshHistory()}>
      {checkingHistory?"Checking executions…":"Refresh executions"}
    </button>
    {historyError&&<p role="alert">{historyError}</p>}
    {history?.provider==="docker"&&<p role="status">The Docker provider does not persist execution history.</p>}
    {history?.provider==="kubernetes"&&history.items.length===0&&<p role="status">No executions recorded.</p>}
    {history?.items.length?<ul aria-label="Recent executions">{history.items.map(item=><li key={item.id}>
      <code>{item.id}</code> · {item.language.toUpperCase()} · {item.kind} · {item.state==="CLEANUP_PENDING"?"Cleanup pending":item.state} · {new Date(item.createdAt).toLocaleString()}
      {item.capacityRetryWaitMs!=null&&<> | Capacity retry wait (client measured) {item.capacityRetryWaitMs.toLocaleString()} ms</>}
      {item.provisioningDurationMs!=null&&<> · Provisioning {item.provisioningDurationMs.toLocaleString()} ms</>}
      {item.schedulingDurationMs!=null&&<> · Time to schedule {item.schedulingDurationMs.toLocaleString()} ms</>}
      {item.containerStartupDurationMs!=null&&<> · Post-schedule startup {item.containerStartupDurationMs.toLocaleString()} ms</>}
      {item.runnerDurationMs!=null&&<> · Runner lifetime {item.runnerDurationMs.toLocaleString()} ms</>}
      {item.failureReason&&<> · {failureLabels[item.failureReason]}</>}
      {["PROVISIONING","RUNNING"].includes(item.state)&&<button type="button" className="secondary" disabled={checkingHistory}
        onClick={()=>void refreshHistory(item.id)}>Cancel execution</button>}
    </li>)}</ul>:null}
  </section>;
}
