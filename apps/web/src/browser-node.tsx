import React,{useEffect,useRef,useState} from "react";
import type {CapabilityProfile,ResourceSnapshot} from "@omnicompile/contracts";
import {BrowserSession,type BrowserState} from "./browser-session.js";
import {Notice} from "./notice.js";
import {api} from "./api.js";
const pausePreference="omnicompile_browser_pause_v1";
function rememberPause(paused:boolean){try{sessionStorage.setItem(pausePreference,paused?"1":"0");}catch{/* Storage may be disabled. In-memory pause remains authoritative. */}}

export function browserProfile():CapabilityProfile{
  const ua=navigator.userAgent,phone=/Android.*Mobile|iPhone/i.test(ua),tablet=/Android|iPad/i.test(ua);
  return{workerType:"BROWSER",deviceType:phone?"PHONE":tablet?"TABLET":"DESKTOP",cpuModel:"Browser-reported device",logicalCores:Math.max(1,Math.min(1024,navigator.hardwareConcurrency||1)),totalMemoryBytes:0,operatingSystem:navigator.platform||"Browser",architecture:"browser",runtimes:{c:false,python:false,java:false},toolchains:{c:{available:false},python:{available:false},java:{available:false}},operations:{irOptimization:true,staticAnalysis:false,browserCompute:true,nativeCompilation:false,taskCancellation:true,portableMatrix:true,portableBenchmark:true},contributionPolicy:{enabled:true,allowBackground:false}};
}
export function browserResources():ResourceSnapshot{
  return{cpuUtilizationPercent:0,cpuMeasurementAvailable:false,freeMemoryBytes:0,memoryUtilizationPercent:0,memoryMeasurementAvailable:false,observedAt:new Date().toISOString(),lifecycleState:"FOREGROUND",networkType:navigator.onLine===false?"OFFLINE":"UNKNOWN"};
}
export function BrowserNode({networkName,onLeave}:{networkName?:string;onLeave?:()=>void}){
  const[state,setState]=useState<BrowserState>({nodeId:"",status:"CONNECTING",error:""}),[leaving,setLeaving]=useState(false),[rotation,setRotation]=useState(""),session=useRef<BrowserSession|null>(null);
  useEffect(()=>{
    if(typeof Worker==="undefined"||typeof WebSocket==="undefined"){setState(s=>({...s,status:"ERROR",error:"This browser does not support Web Workers and WebSockets. Open a current Chrome or Edge browser."}));return;}
    const controller=new BrowserSession({url:`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/ws/worker`,profile:browserProfile,resources:browserResources,onChange:setState,socket:url=>new WebSocket(url),worker:()=>new Worker(new URL("./browser-worker.ts",import.meta.url),{type:"module"})});session.current=controller;
    const visibility=()=>controller.visibility(document.hidden),online=()=>controller.online(navigator.onLine),hide=()=>controller.visibility(true),show=()=>{controller.online(navigator.onLine);controller.visibility(document.hidden);};
    visibility();online();try{if(sessionStorage.getItem(pausePreference)==="1")controller.pause();}catch{/* No credentials are read from browser storage. */}controller.start();document.addEventListener("visibilitychange",visibility);document.addEventListener("freeze",hide);document.addEventListener("resume",show);window.addEventListener("offline",online);window.addEventListener("online",online);window.addEventListener("pagehide",hide);window.addEventListener("pageshow",show);
    return()=>{controller.stop();session.current=null;document.removeEventListener("visibilitychange",visibility);document.removeEventListener("freeze",hide);document.removeEventListener("resume",show);window.removeEventListener("offline",online);window.removeEventListener("online",online);window.removeEventListener("pagehide",hide);window.removeEventListener("pageshow",show);};
  },[]);
  async function leave(){if(leaving)return;setLeaving(true);session.current?.pause();try{await api("/api/worker/leave",{method:"POST"});rememberPause(false);session.current?.stop();setState(s=>({...s,status:"LEFT",error:""}));onLeave?.();}catch(cause){setState(s=>({...s,error:cause instanceof Error?cause.message:"Unable to leave network. Contribution is paused; retry leaving."}));}finally{setLeaving(false);}}
  async function rotate(){if(leaving)return;setLeaving(true);rememberPause(true);session.current?.pause();setRotation("");try{await api("/api/worker/rotate-credential",{method:"POST"});setRotation("Credential rotated in the protected HttpOnly cookie. Resume contribution explicitly.");}catch(cause){setState(s=>({...s,error:cause instanceof Error?cause.message:"Credential rotation could not be confirmed. Contribution is paused."}));}finally{setLeaving(false);}}
  function toggleContribution(){const resume=["PAUSED","DISCONNECTED"].includes(state.status);rememberPause(!resume);if(resume)session.current?.resume();else session.current?.pause();}
  if(state.status==="LEFT")return <div className="card browser-node"><h2>You left the network</h2><p role="status">Contribution has stopped and your worker enrollment has been revoked. To join again, open an active network invitation and give consent.</p></div>;
  return <div className="card browser-node"><span role="status" aria-label="Worker status" className={`status status-${state.status.toLowerCase()}`}>{state.status}</span><h2>Browser worker</h2><dl><dt>Node</dt><dd><code>{state.nodeId||"Registering…"}</code></dd><dt>Network</dt><dd>{networkName??"Enrolled network"}</dd><dt>Capabilities</dt><dd>Bounded portable computation · C IR optimization</dd><dt>Resource measurements</dt><dd>OS CPU and available RAM are not available to this browser. Workload memory values are estimates, not measurements.</dd></dl>
    {state.taskId&&<div><p>Executing authorized task <code>{state.taskId}</code></p><progress aria-label="Task computation progress" max={100} value={state.progress??0}/><p>{state.progress??0}% of computation work units; coordinator validation follows.</p></div>}
    <p className="muted">Keep this tab visible. Background, closed or offline tabs do not contribute. Pause stops this tab’s active computation; interrupted work is recovered by the coordinator. No GCC, Python, Java or shell commands run in this browser.</p><Notice error={state.error} message={rotation}/>
    <div className="actions"><button disabled={leaving||state.status==="ERROR"} onClick={toggleContribution}>{["PAUSED","DISCONNECTED"].includes(state.status)?"Resume contribution":"Pause contribution"}</button><button className="secondary" disabled={leaving} onClick={rotate}>Rotate private credential</button><button className="danger" disabled={leaving} onClick={leave}>{leaving?"Leaving…":"Leave network"}</button></div>
  </div>;
}
