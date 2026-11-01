import React,{useEffect,useRef,useState} from "react";
import {testTaskSchema,type TestTaskPayload} from "@c-optiforge/contracts";
import {api} from "./api.js";
import {Notice} from "./notice.js";
import {Pagination} from "./pagination.js";

const templates:Record<TestTaskPayload["operation"],TestTaskPayload>={
  sha256:{operation:"sha256",input:"OmniCompile Core"},
  prime_count:{operation:"prime_count",limit:10000},
  sha256_chain:{operation:"sha256_chain",input:"OmniCompile Core",iterations:1000},
  matrix_multiply:{operation:"matrix_multiply",left:[[1,2],[3,4]],right:[[5,6],[7,8]]},
  portable_benchmark:{operation:"portable_benchmark",seed:42,iterations:10000}
};
const terminal=(status:string)=>["COMPLETED","FAILED","CANCELLED"].includes(status);
type Task={id:string;status:string;operation:string;attempt:number;createdAt:string;error?:string;deadlineAt?:string;attempts?:any[];result?:{result:unknown;executionTimeMs:number}|null};
type TaskPage={items:Task[];page:number;pageSize:number;totalItems:number;totalPages:number};

export function ComputeTasks(){
  const[operation,setOperation]=useState<TestTaskPayload["operation"]>("sha256"),[input,setInput]=useState(JSON.stringify(templates.sha256,null,2)),[catalogue,setCatalogue]=useState<any[]>([]),[page,setPage]=useState(1),[history,setHistory]=useState<TaskPage>({items:[],page:1,pageSize:10,totalItems:0,totalPages:0}),[selected,setSelected]=useState<Task|null>(null),[error,setError]=useState(""),[pending,setPending]=useState(false),[updated,setUpdated]=useState("");
  const active=history.items.some(task=>!terminal(task.status))||Boolean(selected&&!terminal(selected.status)),posting=useRef(false);
  const descriptor=catalogue.find(item=>item.operation===operation);
  async function refresh(selectedId:string|null=selected?.id??null,historyPage=page){
    try{const data=await api(`/api/compute/tasks?page=${historyPage}`);setHistory(data);if(selectedId)setSelected(await api(`/api/compute/tasks/${selectedId}`));setUpdated(new Date().toLocaleTimeString());setError("");}
    catch(cause){setError(cause instanceof Error?cause.message:"Unable to refresh compute tasks.");}
  }
  useEffect(()=>{let alive=true;api("/api/tasks/catalogue").then(data=>{if(alive)setCatalogue(data.items);}).catch(cause=>{if(alive)setError(cause.message);});return()=>{alive=false};},[]);
  useEffect(()=>{void refresh();},[page]);
  useEffect(()=>{if(!active)return;const timer=setInterval(()=>void refresh(),1500);return()=>clearInterval(timer);},[active,page,selected?.id]);
  async function submit(event:React.FormEvent){
    event.preventDefault();if(posting.current||active)return;
    posting.current=true;setPending(true);setError("");
    try{let payload:unknown;try{payload=JSON.parse(input);}catch{throw new Error("Enter valid JSON workload parameters.");}
      const parsed=testTaskSchema.safeParse(payload);
      if(!parsed.success)throw new Error("Invalid workload parameters: "+parsed.error.issues.map(issue=>`${issue.path.join(".")||"input"}: ${issue.message}`).join("; "));
      if(parsed.data.operation!==operation)throw new Error("Parameters must match the selected workload.");
      const task=await api("/api/compute/tasks",{method:"POST",body:JSON.stringify({payload:parsed.data})});
      setSelected(await api(`/api/compute/tasks/${task.id}`));setPage(1);await refresh(null,1);
    }catch(cause){setError(cause instanceof Error?cause.message:"Task submission failed.");}
    finally{posting.current=false;setPending(false);}
  }
  async function inspect(id:string){try{setSelected(await api(`/api/compute/tasks/${id}`));setError("");}catch(cause){setError(cause instanceof Error?cause.message:"Task details unavailable.");}}
  async function cancel(){if(!selected||posting.current)return;posting.current=true;setPending(true);try{await api(`/api/compute/tasks/${selected.id}/cancel`,{method:"POST"});setSelected(await api(`/api/compute/tasks/${selected.id}`));await refresh();}catch(cause){setError(cause instanceof Error?cause.message:"Cancellation failed.");}finally{posting.current=false;setPending(false);}}
  return <><Notice error={error}/><p>Authorized portable workloads only. OmniCompile Core selects a compatible network automatically and independently verifies worker results. No shell commands are accepted.</p><div className="grid two">
    <form className="card compiler-form" onSubmit={submit} aria-busy={pending}>
      <label>Workload<select aria-label="Workload" value={operation} disabled={pending||active} onChange={event=>{const next=event.target.value as TestTaskPayload["operation"];setOperation(next);setInput(JSON.stringify(templates[next],null,2));}}>{Object.keys(templates).map(value=><option key={value} value={value}>{value.replaceAll("_"," ")}</option>)}</select></label>
      <label>Workload parameters (JSON)<textarea rows={7} value={input} maxLength={410000} disabled={pending||active} onChange={event=>setInput(event.target.value)} spellCheck={false}/></label>
      {descriptor&&<dl><dt>Required capability</dt><dd>{descriptor.requirements.operationCapability}</dd><dt>Working-memory estimate, not measured usage</dt><dd>{descriptor.estimatedResources.estimatedWorkingMemoryBytes} bytes</dd><dt>Execution time limit</dt><dd>{descriptor.executionLimit.maxDurationMs/1000} seconds</dd><dt>Independent verification</dt><dd>{descriptor.verification.method}</dd></dl>}
      <button disabled={pending||active}>{pending?"Submitting…":active?"Task in progress…":"Submit compute task"}</button>
    </form>
    <div className="card"><h2>Current compute task</h2>{selected?<><dl><dt>ID</dt><dd><code>{selected.id}</code></dd><dt>Status</dt><dd>{selected.status}</dd><dt>Attempts</dt><dd>{selected.attempt}</dd><dt>Deadline</dt><dd>{selected.deadlineAt??"Not available"}</dd></dl><Notice error={selected.error??""}/>{selected.result&&<><h3>Verified result</h3><pre className="result-json">{JSON.stringify(selected.result.result,null,2)}</pre><p>Worker execution time: {selected.result.executionTimeMs} ms (reported; independently verified result).</p></>}{!terminal(selected.status)&&<button className="danger" disabled={pending} onClick={cancel}>Cancel compute task</button>}{selected.attempts?.map(attempt=><p key={attempt.attempt}>Attempt {attempt.attempt}: {attempt.status}{attempt.failureReason?` — ${attempt.failureReason}`:""}</p>)}</>:<p>Submit or inspect a task to see its actual state and verified result.</p>}</div>
  </div><section><div className="section-title"><h2>Your compute tasks</h2><button className="secondary" onClick={()=>void refresh()}>Refresh tasks</button></div>{updated&&<p role="status">Updated {updated}</p>}<div className="table-wrap"><table><thead><tr><th>Task</th><th>Workload</th><th>Status</th><th>Attempts</th><th>Action</th></tr></thead><tbody>{history.items.length?history.items.map(task=><tr key={task.id}><td><code>{task.id}</code></td><td>{task.operation}</td><td>{task.status}</td><td>{task.attempt}</td><td><button className="secondary" onClick={()=>inspect(task.id)}>Inspect task</button></td></tr>):<tr><td colSpan={5}>No compute tasks yet.</td></tr>}</tbody></table></div><Pagination page={page} totalPages={history.totalPages} onChange={setPage}/></section></>;
}
