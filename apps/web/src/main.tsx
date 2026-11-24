import {pageRoute} from "./page-routes.js";
import {realtimeUrl} from "./realtime.js";
import {installNavigationMotion,navigateWithMotion} from './navigation-motion.js';
import {Home} from './landing.js';
import {PlatformAtmosphere} from './motion.js';
import {ExecutionPlacement} from './execution-placement.js';
import {CompilerMetrics} from "./compiler-metrics.js";
import React,{useEffect,useRef,useState} from "react";
import {createRoot} from "react-dom/client";
import {BrowserNode} from "./browser-node.js";
import "./styles.css";import "./compiler.css";import "./platform.css";
import {CompilationFeedback,needsCompilationUpdate} from "./compilation-feedback.js";
import {Pagination} from "./pagination.js";
import {api} from "./api.js";
import {Notice} from "./notice.js";
import {AdminInspector} from "./admin-inspector.js";
import {EnrollmentAdmin} from "./enrollment-admin.js";
import {NetworkJoinLink} from "./network-join-link.js";
import {AdminToolchains} from "./admin-toolchains.js";
import {WorkerDirectory,workerPlatform} from "./worker-routes.js";
import {WorkerInstallation,type DistributionPlatform} from "./worker-installation.js";
import {joinAllowsPlatform,joinPath,parseJoinRoute,WorkerChoices,type JoinPlatform,type JoinWorkerType} from "./worker-onboarding.js";
import {Login,Signup,Forgot,Reset} from "./auth-pages.js";
import "./terminal.css";
import './motion.css';
import './workspace.css';

type User={id:string;name:string;email:string;role:"ADMIN"|"USER"};
type Page<T>={items:T[];page:number;pageSize:number;totalItems:number;totalPages:number};
const go=navigateWithMotion;
const statusClass=(status:string)=>`status status-${status.toLowerCase()}`;

function Header({user}:{user?:User|null|undefined}){useEffect(()=>{let active=true;if(user)api("/api/user/settings").then(preferences=>{if(active)document.documentElement.dataset.reducedMotion=String(preferences.reducedMotion);}).catch(()=>{});return()=>{active=false;};},[user?.id]);const[logoutError,setLogoutError]=useState("");async function logout(){try{await api("/api/auth/logout",{method:"POST"});go("/login");}catch(cause){setLogoutError(cause instanceof Error?cause.message:"Unable to sign out.");}}return <><a className="skip-link" href="#main-content">Skip to content</a><header><a href="/" className="brand"><span>OC</span> OmniCompile Core</a><nav>{user?.role==="ADMIN"?<><a href="/admin" aria-current={location.pathname==="/admin"?"page":undefined}>Admin</a><button className="link-button" onClick={logout}>Logout</button></>:user?<><a href="/dashboard" aria-current={location.pathname==="/dashboard"?"page":undefined}>Compiler</a><button className="link-button" onClick={logout}>Logout</button></>:!["/login","/signup"].includes(location.pathname)&&<a href="/login" aria-current={location.pathname==="/login"?"page":undefined}>Login</a>}</nav></header>{logoutError&&<Notice error={logoutError}/>}</>}
function Shell({user,title,subtitle,children}:{user?:User|null|undefined;title:string;subtitle:string;children:React.ReactNode}){return <div className="platform-shell"><PlatformAtmosphere/><Header user={user}/><main id="main-content" tabIndex={-1}><div className="heading"><p className="eyebrow">Distributed compute platform</p><h1>{title}</h1><p>{subtitle}</p></div>{children}</main></div>}
function Metric({name,value}:{name:string;value:React.ReactNode}){return <div className="metric"><span>{name}</span><strong>{value}</strong></div>}
function useUser(requiredRole?:"ADMIN"|"USER"){const[user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(true);useEffect(()=>{api("/api/auth/me").then(({user})=>{if(requiredRole&&user.role!==requiredRole)go(user.role==="ADMIN"?"/admin":"/dashboard");else setUser(user)}).catch(()=>go("/login")).finally(()=>setLoading(false))},[]);return{user,loading};}
function DataTable({columns,items,empty="No records found."}:{columns:Array<{label:string;render:(item:any)=>React.ReactNode}>;items:any[];empty?:string}){return <div className="table-wrap"><table><thead><tr>{columns.map(column=><th key={column.label}>{column.label}</th>)}</tr></thead><tbody>{items.length?items.map((item,index)=><tr key={item.id??index}>{columns.map(column=><td key={column.label}>{column.render(item)}</td>)}</tr>):<tr><td colSpan={columns.length} className="empty">{empty}</td></tr>}</tbody></table></div>}

function AdminV2(){
  const{user,loading}=useUser("ADMIN"),[tab,setTab]=useState<"overview"|"workloads"|"audit">("overview"),[overview,setOverview]=useState<any>(null),[networkPage,setNetworkPage]=useState<Page<any>>({items:[],page:1,pageSize:10,totalItems:0,totalPages:1}),[nodesData,setNodesData]=useState<Page<any>>({items:[],page:1,pageSize:10,totalItems:0,totalPages:1}),[nodePage,setNodePage]=useState(1),[jobs,setJobs]=useState<Page<any>>({items:[],page:1,pageSize:10,totalItems:0,totalPages:1}),[tasks,setTasks]=useState<Page<any>>({items:[],page:1,pageSize:10,totalItems:0,totalPages:1}),[audit,setAudit]=useState<Page<any>>({items:[],page:1,pageSize:10,totalItems:0,totalPages:1}),[page,setPage]=useState(1),[jobPage,setJobPage]=useState(1),[taskPage,setTaskPage]=useState(1),[inspection,setInspection]=useState<{kind:"task"|"job"|"node";id:string;node?:any}|null>(null),[error,setError]=useState(""),[networkNotice,setNetworkNotice]=useState(""),[refreshing,setRefreshing]=useState(false),[refreshedAt,setRefreshedAt]=useState<Date|null>(null),[network,setNetwork]=useState({name:"",description:"",maxNodes:50,requireAdminApproval:true});
  async function refresh(force=false){if(refreshInFlight.current&&!force)return;refreshInFlight.current=true;const generation=++refreshGeneration.current;setRefreshing(true);try{const snapshot=await api("/api/admin/overview");if(generation!==refreshGeneration.current)return;setOverview(snapshot);if(tab==="overview"){const[networksPage,nodesPage]=await Promise.all([api(`/api/admin/networks?page=${page}&pageSize=10`),api(`/api/admin/nodes?page=${nodePage}&pageSize=10`)]);if(generation!==refreshGeneration.current)return;setNetworkPage({...networksPage,items:networksPage.items.filter((item:any)=>item.status==="ACTIVE")});setNodesData(nodesPage);}if(tab==="workloads"){const[jobsResult,tasksResult]=await Promise.all([api(`/api/admin/jobs?page=${jobPage}&pageSize=10`),api(`/api/admin/tasks?page=${taskPage}&pageSize=10`)]);if(generation!==refreshGeneration.current)return;setJobs(jobsResult);setTasks(tasksResult);}if(tab==="audit"){const auditResult=await api(`/api/admin/audit?page=${page}&pageSize=10`);if(generation!==refreshGeneration.current)return;setAudit(auditResult);}setError("");setRefreshedAt(new Date());}catch(cause){if(generation!==refreshGeneration.current)return;setError(cause instanceof Error?cause.message:String(cause));}finally{if(generation===refreshGeneration.current){refreshInFlight.current=false;setRefreshing(false);}}}
  const refreshGeneration=useRef(0),refreshInFlight=useRef(false);
  const liveRefresh=useRef(refresh);liveRefresh.current=refresh;
  useEffect(()=>{
    if(!user)return;let stopped=false,socket:WebSocket|undefined,reconnect:ReturnType<typeof setTimeout>|undefined,scheduled:ReturnType<typeof setTimeout>|undefined;
    void liveRefresh.current();
    async function connect(){if(stopped)return;let endpoint:string;try{endpoint=await realtimeUrl("admin");}catch{if(!stopped)reconnect=setTimeout(connect,3000);return;}if(stopped)return;socket=new WebSocket(endpoint);
      socket.onmessage=event=>{try{const message=JSON.parse(event.data);if(message.type==="snapshot"){setOverview(message.data);if(!scheduled)scheduled=setTimeout(()=>{scheduled=undefined;void liveRefresh.current();},750);}}catch{setError("Live update could not be read. Use Refresh to synchronize.");}};
      socket.onclose=event=>{if(!stopped&&event.code!==1008)reconnect=setTimeout(connect,2000);};
      socket.onerror=()=>setError("Live connection interrupted. Refresh remains available.");
    }
    connect();const fallback=setInterval(()=>void liveRefresh.current(),10000);
    return()=>{stopped=true;clearInterval(fallback);clearTimeout(reconnect);clearTimeout(scheduled);socket?.close();};
  },[user]);
  useEffect(()=>{if(user)void refresh(true)},[tab,page,nodePage,jobPage,taskPage]);
  async function createNetwork(event:React.FormEvent){event.preventDefault();try{const result=await api("/api/admin/networks",{method:"POST",body:JSON.stringify({...network,expiresAt:null})});setNetworkNotice(`Network ${result.networkCode} created. Use Show / copy link in its network row to share it.`);setPage(1);await liveRefresh.current(true);}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}}
  async function toggleJoinLink(networkId:string,enabled:boolean){try{const link=await api(`/api/admin/networks/${networkId}/join-link`,{method:"POST",body:JSON.stringify({enabled})});setNetworkNotice(link.enabled?"Network link invoked. Devices can consent and join while capacity is available.":"Network link revoked. New devices cannot join; existing workers stay enrolled.");setError("");await liveRefresh.current(true);}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}}
  async function revoke(nodeId:string){try{await api(`/api/admin/nodes/${nodeId}/revoke`,{method:"POST"});await liveRefresh.current(true);}catch(cause){setError(cause instanceof Error?cause.message:"Worker revocation failed.");}}
  async function disable(networkId:string){try{await api(`/api/admin/networks/${networkId}/disable`,{method:"POST"});await liveRefresh.current(true);}catch(cause){setError(cause instanceof Error?cause.message:"Network disable failed.");}}
  if(loading||!user)return null;
  const totalPages=tab==="overview"?networkPage.totalPages:tab==="workloads"?Math.max(jobs.totalPages,tasks.totalPages):audit.totalPages;
  return <Shell user={user} title="Dashboard" subtitle="Monitor coordinator health, distributed networks, workers, compilation history, and security events.">
    <div className="tabs"><button className={tab==="overview"?"active":"secondary"} onClick={()=>{setTab("overview");setPage(1)}}>Overview</button><button className={tab==="workloads"?"active":"secondary"} onClick={()=>{setTab("workloads");setPage(1)}}>Tasks &amp; jobs</button><button className={tab==="audit"?"active":"secondary"} onClick={()=>{setTab("audit");setPage(1)}}>Audit</button><button className="secondary refresh-button" disabled={refreshing} onClick={()=>void refresh(true)}>{refreshing?<><span className="spinner"/>Refreshing…</>:"Refresh"}</button>{refreshedAt&&<span className="refresh-time">Updated {refreshedAt.toLocaleTimeString()}</span>}</div>
    <Notice error={error}/>{inspection&&<AdminInspector {...inspection} onClose={()=>setInspection(null)}/>}
    {tab==="overview"&&<><div className="metrics"><Metric name="Coordinator" value={overview?.coordinator.status??"—"}/><Metric name="Active networks" value={overview?.summary.activeNetworks??0}/><Metric name="Online workers" value={overview?.summary.onlineWorkers??0}/><Metric name="Busy workers" value={overview?.summary.busyWorkers??0}/><Metric name="Active jobs" value={overview?.summary.activeJobs??0}/><Metric name="Queued / failed" value={`${overview?.summary.queuedTasks??0} / ${overview?.summary.failedTasks??0}`}/></div>
      <form className="card inline-form" onSubmit={createNetwork}><h2>Create network and master link</h2><p className="form-description">Create one network and share its master link with Windows, Android, and web workers. Consent and private device credentials are handled automatically.</p><label>Name<input required maxLength={120} value={network.name} onChange={e=>setNetwork({...network,name:e.target.value})}/></label><label>Description<input value={network.description} onChange={e=>setNetwork({...network,description:e.target.value})}/></label><label>Node limit<input type="number" min="1" value={network.maxNodes} onChange={e=>setNetwork({...network,maxNodes:Number(e.target.value)})}/></label><label className="checkbox-label"><input type="checkbox" checked={network.requireAdminApproval} onChange={e=>setNetwork({...network,requireAdminApproval:e.target.checked})}/>Require administrator approval</label><button>Create network and master link</button>{networkNotice&&<p className="form-description" role="status">{networkNotice}</p>}</form>
      <AdminToolchains/>
      <section className="network-inventory"><div className="section-title"><h2>Networks and worker nodes</h2><span className="muted">Only active networks are listed. Capacity counts connected nodes.</span></div><DataTable items={networkPage.items} columns={[{label:"Network",render:x=><><strong>{x.name}</strong><br/><span>Network {x.networkCode}</span></>},{label:"Status",render:x=><span className={statusClass(x.status)}>{x.status}</span>},{label:"Capacity",render:x=>`${x.nodeCount}/${x.maxNodes}`},{label:"Action",render:x=><><NetworkJoinLink networkId={x.id}/> <button role="switch" aria-label={`Admission for ${x.name}`} aria-checked={Boolean(x.joinLinkEnabled)} disabled={x.status!=="ACTIVE"} onClick={()=>toggleJoinLink(x.id,!x.joinLinkEnabled)}>{x.joinLinkEnabled?"Revoke link":"Invoke link"}</button> <button className="danger" disabled={x.status!=="ACTIVE"} onClick={()=>disable(x.id)}>Disable</button></>}]} /><Pagination page={page} totalPages={networkPage.totalPages} onChange={setPage}/><h3>Worker nodes</h3><DataTable items={nodesData.items} columns={[{label:"Node ID",render:x=><code>{x.id}</code>},{label:"Network",render:x=>x.networkName},{label:"Type",render:x=>x.workerType},{label:"Status",render:x=><span className={statusClass(x.status)}>{x.status}</span>},{label:"Last heartbeat",render:x=>new Date(x.lastHeartbeat).toLocaleString()},{label:"Actions",render:x=><><button className="secondary" onClick={()=>setInspection({kind:"node",id:x.id,node:x})}>Inspect node</button> <button className="danger" onClick={()=>revoke(x.id)}>Revoke node</button></>}]}/><Pagination page={nodePage} totalPages={nodesData.totalPages} onChange={setNodePage}/></section><EnrollmentAdmin networks={networkPage.items}/></>}
    {tab==="workloads"&&<><section><h2>Compilation history</h2><DataTable items={jobs.items} columns={[{label:"Job",render:x=><code>{x.displayName??x.id}</code>},{label:"Source",render:x=>`${x.sourceName} (${x.language.toUpperCase()})`},{label:"Network",render:x=>x.networkName?`Network ${x.networkCode} — ${x.networkName}`:"—"},{label:"Participating nodes",render:x=><ul className="node-list compact">{x.participatingNodes?.length?x.participatingNodes.map((node:string)=><li key={node}><code>{node}</code></li>):<li>—</li>}</ul>},{label:"Status",render:x=><span className={statusClass(x.status)}>{x.status}</span>},{label:"Details",render:x=><button className="secondary" onClick={()=>setInspection({kind:"job",id:x.id})}>Inspect job</button>},{label:"Artifact",render:x=>x.artifactId?<a href={`/api/artifacts/${x.artifactId}/download`}>{x.fileName}</a>:"—"}]} /><Pagination page={jobPage} totalPages={jobs.totalPages} onChange={setJobPage}/></section><section><h2>Distributed task attempts</h2><DataTable items={tasks.items} columns={[{label:"Task",render:x=><code>{x.displayName??x.id}</code>},{label:"Network",render:x=>x.networkName},{label:"Kind",render:x=>x.kind},{label:"Status",render:x=><span className={statusClass(x.status)}>{x.status}</span>},{label:"Attempts",render:x=>x.attemptCount},{label:"Assigned node",render:x=>x.assignedNodeId??"—"},{label:"Details",render:x=><button className="secondary" onClick={()=>setInspection({kind:"task",id:x.id})}>Inspect task</button>}]} /><Pagination page={taskPage} totalPages={tasks.totalPages} onChange={setTaskPage}/></section></>}
    {tab==="audit"&&<section><h2>Audit events</h2><DataTable items={audit.items} columns={[{label:"Event",render:x=>x.eventType},{label:"Actor",render:x=>x.actorType},{label:"Target",render:x=>x.targetId??"—"},{label:"Time",render:x=>new Date(x.createdAt).toLocaleString()}]}/></section>}
    {tab==="audit"&&<Pagination page={page} totalPages={totalPages} onChange={setPage}/>}
  </Shell>;
}

type CompilerLanguage="c"|"python"|"java";

const stageDescriptions:Record<string,string>={VALIDATING:"Validating submitted source",DISTRIBUTED_OPTIMIZATION:"Optimizing through compatible workers",DISTRIBUTED_COMPILATION:"Compiling through a native worker",VERIFYING_COMPILATION:"Independently verifying generated output",CODE_GENERATING:"Generating usable output",PROGRAM_EXECUTION:"Executing in the isolated environment",ARTIFACT_GENERATION:"Preparing verified downloads",COMPLETED:"Compilation complete"};
function CompilationStages({job,language}:{job:any;language:CompilerLanguage}){const irMode=language==="c"&&(job?.batchId||!job||job.stage==="VALIDATING");const stages=["VALIDATING",irMode?"DISTRIBUTED_OPTIMIZATION":"DISTRIBUTED_COMPILATION",...(!irMode?["VERIFYING_COMPILATION"]:[]),"CODE_GENERATING","PROGRAM_EXECUTION","ARTIFACT_GENERATION","COMPLETED"],current=job?Math.max(0,stages.indexOf(job.stage)):0;return <ol className="compilation-stages">{stages.map((stage,index)=>{const execution=stage==="PROGRAM_EXECUTION"&&job?.status==="COMPLETED"?job.metrics?.execution:null;const skipped=stage==="PROGRAM_EXECUTION"&&job?.status==="COMPLETED"&&(!execution||execution.status==="NOT_RUN");const state=skipped?"pending":execution&&execution.status!=="SUCCEEDED"?"failed":!job?"pending":job.status==="COMPLETED"?"done":index<current?"done":index===current?["FAILED","CANCELLED"].includes(job.status)?"failed":"active":"pending";return <li key={stage} className={`stage-${state}`}><span className="stage-indicator">{state==="done"?"✓":state==="failed"?"!":state==="active"?<span className="spinner"/>:index+1}</span><span><strong>{stage.replaceAll("_"," ")}</strong><small>{skipped?"Execution not performed":execution?.status??(state==="pending"?"Waiting":state==="done"?"Completed":state==="failed"?"Failed":stageDescriptions[stage])}</small></span></li>})}</ol>}
function ArtifactDownloads({artifacts}:{artifacts:any[]}){const labels:Record<string,string>={SOURCE:"Original source",GENERATED_SOURCE:"Generated source",EXECUTABLE:"Executable",BYTECODE:"Compiled bytecode / Java class",JAR:"Java archive",BUILD_REPORT_JSON:"Build report (JSON)",BUILD_REPORT_PDF:"Build report (PDF)"};return <section><h3>Generated artifacts</h3><ul className="artifact-list">{artifacts.filter(artifact=>["EXECUTABLE","BYTECODE","JAR","BUILD_REPORT_PDF"].includes(artifact.artifactType)).map(artifact=><li key={artifact.id}><span>{labels[artifact.artifactType]??artifact.artifactType}: <code>{artifact.fileName}</code> <small>({artifact.sizeBytes.toLocaleString()} bytes)</small></span><a className="download" href={artifact.downloadUrl}>Download</a></li>)}</ul></section>}

function DashboardV2(){
  const{user,loading}=useUser("USER"),[language,setLanguage]=useState<CompilerLanguage>("c"),[source,setSource]=useState(""),[sourceName,setSourceName]=useState("program.c"),[executionInput,setExecutionInput]=useState(""),[job,setJob]=useState<any>(null),[report,setReport]=useState<any>(null),[submissionError,setSubmissionError]=useState(""),[error,setError]=useState(""),[submitting,setSubmitting]=useState(false),sourceBox=useRef<HTMLTextAreaElement|null>(null);
  const running=Boolean(job&&!["COMPLETED","FAILED","CANCELLED"].includes(job.status)),extension={c:".c",python:".py",java:".java"}[language];
  useEffect(()=>{setReport(null);if(!job||!["COMPLETED","FAILED","CANCELLED"].includes(job.status))return;if(job.metrics?.report){setReport(job.metrics.report);return;}const artifact=job.artifacts?.find((item:any)=>item.artifactType==="BUILD_REPORT_JSON");if(!artifact)return;let cancelled=false;api(artifact.downloadUrl).then(value=>{if(!cancelled)setReport(value);}).catch(()=>{if(!cancelled)setError("The diagnostic report could not be loaded. Retry the report download.");});return()=>{cancelled=true;};},[job?.id,job?.status,job?.artifacts?.length]);
  useEffect(()=>{if(!job?.id||!needsCompilationUpdate(job))return;let cancelled=false;const deadline=Date.now()+30_000,timer=setInterval(()=>{if(!running&&Date.now()>deadline){clearInterval(timer);setError("The diagnostic report is still being prepared. Refresh to retrieve it.");return;}api(`/api/compilations/${job.id}`).then(value=>{if(!cancelled)setJob(value);}).catch(cause=>{if(!cancelled)setError(cause.message);});},800);return()=>{cancelled=true;clearInterval(timer);};},[job?.id,job?.status,job?.artifacts?.length]);
  useEffect(()=>{const box=sourceBox.current;if(box){box.style.height="108px";box.style.height=`${Math.min(360,Math.max(108,box.scrollHeight))}px`;}},[source]);
  function changeLanguage(next:CompilerLanguage){if(running)return;setJob(null);setReport(null);setLanguage(next);setSource("");setSourceName(next==="c"?"program.c":next==="python"?"program.py":"Main.java");setError("");setSubmissionError("");}
  async function readFile(event:React.ChangeEvent<HTMLInputElement>){const file=event.target.files?.[0];if(!file)return;setJob(null);setReport(null);if(!file.name.toLowerCase().endsWith(extension)){setError(`Choose a ${extension} file for the selected language.`);setSubmissionError(`Language mismatch: choose a ${extension} file for ${language.toUpperCase()}.`);event.target.value="";return;}setSourceName(file.name);setSource(await file.text());setError("");setSubmissionError("");}
  async function submit(){if(running||submitting)return;setJob(null);setReport(null);if(!sourceName.toLowerCase().endsWith(extension)){setError(`The source filename must end in ${extension}.`);setSubmissionError(`Language mismatch: ${language.toUpperCase()} source filenames must end in ${extension}.`);return;}setSubmitting(true);try{setJob(await api("/api/compilations",{method:"POST",body:JSON.stringify({language,sourceName,source,executionInput,executionMode:"AUTO"})}));setError("");setSubmissionError("");setReport(null);}catch(cause){setError(cause instanceof Error?cause.message:String(cause));setSubmissionError(cause instanceof Error?cause.message:String(cause));}finally{setSubmitting(false);}}
  if(loading||!user)return null;
  return <Shell user={user} title="Compiler workspace" subtitle="Supply source code; OmniCompile Core automatically selects a compatible network using current resources and measured execution history."><Notice error={error}/><div className="grid two"><div className="card compiler-form"><label>Language<select aria-label="Language" value={language} disabled={running} onChange={e=>changeLanguage(e.target.value as CompilerLanguage)}><option value="c">C</option><option value="python">Python</option><option value="java">Java</option></select></label><label>Upload source file<input type="file" accept={extension} disabled={running} onChange={readFile}/></label><label>Source filename<input value={sourceName} disabled={running} onChange={e=>setSourceName(e.target.value)}/></label><label>Source code<textarea ref={sourceBox} placeholder="Paste source code or upload a file to begin." value={source} disabled={running} onChange={e=>setSource(e.target.value)} spellCheck={false}/></label><label>Standard input (optional, 16 KB maximum)<textarea rows={3} style={{minHeight:70,height:70}} value={executionInput} maxLength={16384} disabled={running} onChange={e=>setExecutionInput(e.target.value)}/></label><small>Execution uses the isolated Linux environment. Downloads contain compiled output and the PDF report. Compiled output requires the matching operating system, architecture and runtime shown in the report.</small><button disabled={running||submitting||!source.trim()||!sourceName.trim()} onClick={submit}>{submitting?"Selecting network…":running?"Compilation in progress…":"Compile and optimize"}</button><CompilerMetrics jobId={job?.id} language={language}/></div><div className="card"><h2>Current compilation</h2>{job&&<dl><dt>ID</dt><dd><code>{job.displayName??job.id}</code></dd><dt>Status</dt><dd><span className={statusClass(job.status)}>{job.status==="COMPLETED"?job.metrics?.outcome??"SUCCESS":job.status==="FAILED"?"FAILED":job.status==="CANCELLED"?"CANCELLED":stageDescriptions[job.stage]??job.status}</span></dd></dl>}<ExecutionPlacement job={job}/>{job?.metrics?.compilationAssistance&&<p><strong>Server-assisted compilation</strong> · Worker: {job.metrics.compilationAssistance.workerNodeId??"participating devices"}. The server supplied the compiler tool.</p>}<CompilationStages job={job} language={language}/><CompilationFeedback job={job} report={report} error={submissionError} onCancel={async()=>{try{setJob(await api(`/api/compilations/${job.id}/cancel`,{method:"POST"}));}catch(cause){setError(cause instanceof Error?cause.message:"Cancellation failed");}}}/> {["COMPLETED","FAILED"].includes(job?.status)&&job.artifacts?.length>0&&<ArtifactDownloads artifacts={job.artifacts}/>}</div></div></Shell>;
}

function deviceNonce(){const values=new Uint32Array(4);if(globalThis.crypto?.getRandomValues){globalThis.crypto.getRandomValues(values);return Array.from(values,value=>value.toString(16).padStart(8,"0")).join("");}return`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;}
type JoinNetwork = {networkCode?:string;
  id: string; name: string; description: string; status: string; nodeCount: number; maxNodes: number;
  accepting: boolean; joinLinkStatus?: string; invitationStatus?: string; workerTypes?: JoinWorkerType[];
};

function Join({token,platform,networkCode}:{token:string;platform?:JoinPlatform;networkCode?:string}){
  const [network,setNetwork]=useState<JoinNetwork|null>(null);
  const [joined,setJoined]=useState(false);
  const [joining,setJoining]=useState(false);
  const [error,setError]=useState("");
  const [download,setDownload]=useState<{artifact:DistributionPlatform;downloadUrl:string}|null>(null);
  const [downloadError,setDownloadError]=useState("");
  const [downloadPending,setDownloadPending]=useState(false);
  const [downloadRequest,setDownloadRequest]=useState(0);
  const nativePlatform=platform==="android"?"ANDROID":platform==="windows"?"WINDOWS":undefined;
  const platformAllowed=!!network&&!!platform&&joinAllowsPlatform(network.workerTypes,platform);

  useEffect(()=>{
    if(!nativePlatform||!network?.accepting||!platformAllowed)return;
    let active=true;
    let expiry:number|undefined;
    setDownload(null);
    setDownloadError("");
    setDownloadPending(true);
    api("/api/enrollment/download-authorize",{
      method:"POST",body:JSON.stringify({token,platform:nativePlatform}),
    }).then(value=>{
      if(!active)return;
      setDownload({artifact:value.artifact,downloadUrl:value.downloadUrl});
      expiry=window.setTimeout(()=>{
        setDownload(null);
        setDownloadError("Download authorization expired. Request another download.");
      },value.expiresInSeconds*1000);
    }).catch(cause=>{
      if(active)setDownloadError(cause instanceof Error?cause.message:String(cause));
    }).finally(()=>{
      if(active)setDownloadPending(false);
    });
    return()=>{
      active=false;
      if(expiry!==undefined)window.clearTimeout(expiry);
    };
  },[token,nativePlatform,network?.accepting,platformAllowed,downloadRequest]);

  async function load(){
    try{
      const result=await api("/api"+joinPath(token,undefined,networkCode));
      setNetwork(result.network);
      if(result.network.networkCode){const canonical=joinPath(token,platform,result.network.networkCode);if(location.pathname!==canonical)history.replaceState(null,"",canonical);}
      if(result.network.accepting)setError("");
      if(platform==="web"){
        try{
          const existing=await api("/api/worker/me");
          if(existing.networkId===result.network.id)setJoined(true);
        }catch{/* Explicit consent is required without an enrolled browser session. */}
      }
    }catch(cause){
      setNetwork(null);
      setError(cause instanceof Error?cause.message:String(cause));
    }
  }

  useEffect(()=>{
    if(joined)return;
    void load();
    const timer=setInterval(()=>void load(),5000);
    return()=>clearInterval(timer);
  },[token,platform,joined]);

  async function accept(){
    setJoining(true);
    try{
      await api("/api"+joinPath(token,undefined,networkCode)+"/accept",{method:"POST",body:JSON.stringify({
        consent:true,workerType:"BROWSER",deviceIdentity:`${navigator.userAgent}|${deviceNonce()}`
      })});
      setJoined(true);
    }catch(cause){
      setError(cause instanceof Error?cause.message:String(cause));
      void load();
    }finally{
      setJoining(false);
    }
  }

  const expired=network&&[network.joinLinkStatus,network.invitationStatus].some(status=>status==="REVOKED"||status==="EXPIRED");
  const unavailable=network?.joinLinkStatus==="FULL"?"This network is full. Try again when a worker slot becomes available.":
    expired?"The administrator has revoked this link, or the network is no longer active. Contact the network administrator.":
    network?.invitationStatus==="CONSUMED"?"This invitation has already been used. Request a new invitation from the administrator.":
    "Enrollment is currently unavailable. Contact the network administrator.";
  const title=joined?"Worker dashboard":expired?"Network link expired":!platform||platform==="web"?"Join distributed network":
    platform==="android"?"Join as an Android worker":"Join as a Windows worker";

  return <Shell title={title} subtitle="Participation is explicit, scoped to one network, and revocable.">
    <Notice error={error}/>
    {!network&&!error&&<p role="status">Checking invitation…</p>}
    {joined?<BrowserNode {...(network?{networkName:network.name}:{})} onLeave={()=>{setJoined(false);void load();}}/>:network&&<>
      <div className="card">
        <h2>{network.name}</h2>
        <p>{network.description}</p>
        <dl>
          <dt>Status</dt><dd><span className={statusClass(network.status)}>{network.status}</span></dd>
          <dt>Nodes</dt><dd>{network.nodeCount}/{network.maxNodes}</dd>
          <dt>Coordinator</dt><dd><code>{location.origin}</code></dd>
        </dl>
        {!network.accepting&&<p role="status">{unavailable}</p>}
      </div>
      {!platform&&<WorkerChoices networkCode={network?.networkCode??networkCode} token={token} accepting={network.accepting} {...(network.workerTypes?{workerTypes:network.workerTypes}:{})}/>}
      {platform&&<p><a href={joinPath(token,undefined,network?.networkCode??networkCode)}>Choose another worker platform</a></p>}
      {platform&&network.accepting&&!platformAllowed&&<p role="status">This invitation does not allow this platform.</p>}
      {platform==="web"&&network.accepting&&platformAllowed&&<div className="card consent">
        <h2>Continue in this browser</h2>
        <p>OmniCompile Core will report browser capability and resource availability, maintain a heartbeat, and run schema-validated browser compute or IR optimization tasks.</p>
        <button disabled={joining} onClick={accept}>{joining?"Joining…":"Become a Worker"}</button>
      </div>}
      {nativePlatform&&network.accepting&&platformAllowed&&<>
        {downloadPending&&<p role="status">Checking device compatibility and package availability…</p>}
        {downloadError&&<p role="status">{downloadError}</p>}
        {!downloadPending&&<WorkerInstallation
          joinUrl={location.origin+joinPath(token,undefined,network?.networkCode??networkCode)}
          platforms={download?[download.artifact]:[]}
          platform={nativePlatform}
          {...(download?{authorizedUrl:download.downloadUrl}:{})}
        />}
        {!downloadPending&&<button type="button" onClick={()=>setDownloadRequest(value=>value+1)}>Request a new download</button>}
      </>}
    </>}
  </Shell>;
}
function WorkerPage(){return <Shell title="Worker console" subtitle="Reconnect a previously enrolled browser worker using its secure HttpOnly enrollment cookie."><BrowserNode/></Shell>}

function App(){const route=pageRoute(location.pathname),path=route.path,join=parseJoinRoute(path);useEffect(()=>{document.title=route.title;},[route.title]);if(route.redirect)return <CanonicalRedirect path={route.redirect}/>;if(!route.found)return <Shell title="Page not found" subtitle="This address does not match an OmniCompile Core page."><p><a href="/">Return to the landing page</a> · <a href="/worker">Worker platforms</a> · <a href="/login">Sign in</a></p></Shell>;if(join)return <Join {...join}/>;if(path==="/login")return <Login Shell={Shell}/>;if(path==="/signup")return <Signup Shell={Shell}/>;if(path==="/forgot-password")return <Forgot Shell={Shell}/>;if(path==="/reset-password")return <Reset Shell={Shell}/>;if(path==="/admin")return <AdminV2/>;if(path==="/dashboard")return <DashboardV2/>;if(path==="/settings"||path==="/compute")return <WorkspaceRedirect/>;if(path==="/worker"||workerPlatform(path)){const platform=workerPlatform(path),params=new URLSearchParams(location.search),token=params.get("token");if(token)return <Join token={token} {...(platform?{platform}:{})}/>;if(platform==="web"&&params.get("reconnect")==="1")return <WorkerPage/>;return <Shell title={platform?`${platform==="web"?"Web":platform==="windows"?"Windows":"Android"} worker`:"Worker platforms"} subtitle="Connect over the internet with explicit consent."><WorkerDirectory {...(platform?{platform}:{})}/></Shell>;}return <Home/>}
const disposeMotion=installNavigationMotion();
if(import.meta.hot)import.meta.hot.dispose(disposeMotion);
createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);

function WorkspaceRedirect(){useEffect(()=>{location.replace("/dashboard");},[]);return null;}

function CanonicalRedirect({path}:{path:string}){useEffect(()=>{location.replace(path+location.search+location.hash);},[path]);return null;}
