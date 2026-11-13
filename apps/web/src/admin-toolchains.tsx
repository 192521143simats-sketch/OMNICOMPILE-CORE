import React,{useState} from "react";
import {api} from "./api.js";

type Toolchains = {
  status:"NOT_CONFIGURED"|"REACHABLE";
  toolchains:Array<{language:"c"|"python"|"java";reference:string;available:boolean;imageId:string|null}>;
};

export function AdminToolchains(){
  const [report,setReport]=useState<Toolchains>();
  const [error,setError]=useState("");
  const [pending,setPending]=useState(false);
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
      <strong>{item.language.toUpperCase()}</strong> · {item.available?"Available":"Unavailable"} · <code>{item.reference}</code>
    </li>)}</ul>}
  </section>;
}
