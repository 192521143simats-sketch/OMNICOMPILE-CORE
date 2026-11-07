import React,{useEffect,useState} from 'react';
import {api} from './api.js';
import './compiler-metrics.css';

type Platform='WEB'|'WINDOWS'|'ANDROID'|'CLOUD'|'NATIVE_OTHER';
const platformLabels:Record<Platform,string>={WEB:'Web',WINDOWS:'Windows',ANDROID:'Android',CLOUD:'Cloud',NATIVE_OTHER:'Other native'};
const platformLabel=(value:string)=>platformLabels[value as Platform]??value;
type Availability={registered:number;connected:number;available:number;busy:number;disconnected:number;unhealthy:number;percentage:number|null};
type Resources={cpuPercent:number|null;ramPercent:number|null;cpuReadings:number;ramReadings:number;lastUpdatedAt:string|null};
export type CompilerMetricSnapshot={
  scope:'OWN_JOBS';observedAt:string;
  tasks:{successful:number;failed:number;timedOut:number;cancelled:number;pending:number;running:number;totalCompleted:number;successRate:number|null;trend:Array<{date:string;successful:number;failed:number;timedOut:number;totalCompleted:number;successRate:number|null}>};
  completion:{averageMs:number|null;count:number;platforms:Array<{platform:string;averageMs:number|null;count:number}>};
  availability:Availability&{platforms:Array<Availability&{platform:string}>;history:Array<Availability&{at:string;jobId?:string}>};
  resources:Resources&{platforms:Array<Resources&{platform:string}>};
  verification:{verified:number;rejected:number;failed:number;pending:number;completed:number;rate:number|null;history:Array<{taskId:string;workerId:string;outcome:string;method:string;receivedAt:string;completedAt:string|null}>};
};
const number=(value:number|null|undefined,suffix='')=>typeof value==='number'&&Number.isFinite(value)?`${value.toLocaleString(undefined,{maximumFractionDigits:1})}${suffix}`:'Not available';
const timestamp=(value:string|null|undefined)=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString():'Not available';
function Rows({items}:{items:Array<[string,React.ReactNode]>}){return <dl className="compiler-metric-values">{items.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;}
function PlatformTable({caption,columns,rows}:{caption:string;columns:string[];rows:React.ReactNode[][]}){return <div className="table-wrap"><table><caption>{caption}</caption><thead><tr>{columns.map(column=><th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{rows.length?rows.map((row,index)=><tr key={index}>{row.map((cell,position)=><td key={position}>{cell}</td>)}</tr>):<tr><td colSpan={columns.length}>No matching records yet.</td></tr>}</tbody></table></div>;}

/** Owner-scoped runtime data only. The coordinator is authoritative for ownership and calculations. */
export function CompilerMetrics({jobId,language:submittedLanguage}:{jobId?:string;language?:string}){
  const[language,setLanguage]=useState(submittedLanguage??''),[platform,setPlatform]=useState<Platform|''>(''),[scope,setScope]=useState<'current'|'history'>('current');
  const[data,setData]=useState<CompilerMetricSnapshot|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>setLanguage(submittedLanguage??''),[submittedLanguage]);
  useEffect(()=>{
    let disposed=false,timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined;
    setData(null);setError('');setLoading(true);
    async function read(){
      controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),15000);
      try{
        const query=new URLSearchParams();if(language)query.set('language',language);if(platform)query.set('platform',platform);if(jobId&&scope==='current')query.set('jobId',jobId);
        const next=await api(`/api/user/compiler-metrics${query.size?`?${query}`:''}`,{signal:controller.signal}) as CompilerMetricSnapshot;
        if(next.scope!=='OWN_JOBS')throw new Error('Owner-scoped metrics are unavailable.');
        if(!disposed){setData(next);setError('');}
      }catch(cause){if(!disposed)setError(cause instanceof Error&&cause.name!=='AbortError'?cause.message:'The metrics request timed out. Retrying automatically.');}
      finally{clearTimeout(timeout);if(!disposed){setLoading(false);timer=setTimeout(()=>void read(),3000);}}
    }
    void read();return()=>{disposed=true;clearTimeout(timer);controller?.abort();};
  },[jobId,scope,language,platform]);
  return <section className="compiler-metrics" aria-labelledby="compiler-metrics-heading" data-testid="compiler-metrics">
    <div className="compiler-metrics-heading"><div><h2 id="compiler-metrics-heading">Live performance · your jobs</h2><p>Measured coordinator records for your selected jobs only. Worker statistics cover participating registrations, not the entire network.</p></div><span className="status">{loading?'Loading':error?'Updates interrupted':'Live · every 3 seconds'}</span></div>
    <div className="compiler-metrics-filters">
      <label>Metrics scope<select aria-label="Metrics scope" value={scope} onChange={event=>setScope(event.target.value as typeof scope)}><option value="current" disabled={!jobId}>{jobId?'Current job':'No current job — your jobs'}</option><option value="history">My jobs</option></select></label>
      <label>Metrics language<select aria-label="Metrics language" value={language} onChange={event=>setLanguage(event.target.value)}><option value="">All languages</option><option value="c">C</option><option value="python">Python</option><option value="java">Java</option></select></label>
      <label>Worker platform<select aria-label="Metrics platform" value={platform} onChange={event=>setPlatform(event.target.value as Platform|'')}><option value="">All platforms</option><option value="WEB">Web</option><option value="WINDOWS">Windows</option><option value="ANDROID">Android</option><option value="CLOUD">Cloud</option><option value="NATIVE_OTHER">Other native</option></select></label>
    </div>
    <p className="compiler-metrics-updated">Last successful snapshot: <time dateTime={data?.observedAt}>{timestamp(data?.observedAt)}</time>{error&&' · Last values may be stale.'}</p>
    {error&&<p role="alert" className="notice">{error}</p>}
    {loading&&<p role="status"><span className="spinner"/> Reading measured performance…</p>}
    {data&&<div className="compiler-metrics-grid">
      <article><h3>1. Task execution success rate</h3><strong className="compiler-metric-primary">{number(data.tasks.successRate,'%')}</strong><p>{data.tasks.successful} / {data.tasks.totalCompleted} completed outcomes successful</p><Rows items={[["Successful",data.tasks.successful],["Failed",data.tasks.failed],["Timed out",data.tasks.timedOut],["Cancelled · excluded",data.tasks.cancelled],["Pending",data.tasks.pending],["Running",data.tasks.running]]}/><small>Only coordinator-accepted results count as successful. Pending, running and cancelled tasks are excluded from the percentage.</small><details><summary>Historical success trend</summary><PlatformTable caption="Daily task outcomes" columns={['Date','Successful / completed','Success rate']} rows={data.tasks.trend.map(row=>[row.date,`${row.successful} / ${row.totalCompleted}`,number(row.successRate,'%')])}/></details></article>
      <article><h3>2. End-to-end task completion time</h3><strong className="compiler-metric-primary">{number(data.completion.averageMs,' ms')}</strong><p>{data.completion.count} successful completed tasks</p><small>Dispatch to result receipt at the coordinator, including communication and coordination overhead—not just worker processing. Failed, cancelled and incomplete work is excluded.</small><PlatformTable caption="Completion time by worker platform" columns={['Platform','Average','Completed']} rows={data.completion.platforms.map(row=>[platformLabel(row.platform),number(row.averageMs,' ms'),row.count])}/></article>
      <article><h3>3. Worker availability</h3><strong className="compiler-metric-primary">{number(data.availability.percentage,'%')}</strong><p>{data.availability.connected} connected / {data.availability.registered} registered active participants</p><Rows items={[["Available",data.availability.available],["Busy",data.availability.busy],["Disconnected",data.availability.disconnected],["Unhealthy",data.availability.unhealthy]]}/><small>Available ÷ active, non-revoked participating registrations. Connected does not necessarily mean available for another task.</small><PlatformTable caption="Worker availability by platform" columns={['Platform','Available / registered','Busy','Disconnected','Availability']} rows={data.availability.platforms.map(row=>[platformLabel(row.platform),`${row.available} / ${row.registered}`,row.busy,row.disconnected,number(row.percentage,'%')])}/><details><summary>Availability history</summary><PlatformTable caption="Job-scoped availability history" columns={['Job','Observed','Available / registered','Availability']} rows={data.availability.history.map(row=>[row.jobId??'Selected job',timestamp(row.at),`${row.available} / ${row.registered}`,number(row.percentage,'%')])}/></details></article>
      <article><h3>4. Measured resource utilization</h3><Rows items={[["Average CPU",number(data.resources.cpuPercent,'%')],["Average RAM",number(data.resources.ramPercent,'%')],["Valid CPU readings",data.resources.cpuReadings],["Valid RAM readings",data.resources.ramReadings],["Last telemetry update",timestamp(data.resources.lastUpdatedAt)]]}/><small>CPU and RAM are independent worker-reported measurements during task execution. Unsupported readings are omitted, never counted as zero. Browser device-wide CPU/RAM access may be unavailable; stale readings are not current utilization.</small><PlatformTable caption="Resource utilization by platform" columns={['Platform','CPU','RAM','Telemetry update']} rows={data.resources.platforms.map(row=>[platformLabel(row.platform),number(row.cpuPercent,'%'),number(row.ramPercent,'%'),timestamp(row.lastUpdatedAt)])}/></article>
      <article><h3>5. Result verification rate</h3><strong className="compiler-metric-primary">{number(data.verification.rate,'%')}</strong><p>{data.verification.verified} / {data.verification.completed} completed verification attempts verified</p><Rows items={[["Verified",data.verification.verified],["Rejected",data.verification.rejected],["Verification failed",data.verification.failed],["Pending verification",data.verification.pending]]}/><small>Verification outcomes measure the checks performed, not an absolute guarantee against malicious computation. A checksum match is not proof of computational correctness. Rejected and unverified outputs cannot enter trusted aggregation.</small><details><summary>Verification history and methods</summary><PlatformTable caption="Recent result verification attempts" columns={['Task','Worker','Outcome','Method','Received','Completed']} rows={data.verification.history.map(row=>[row.taskId,row.workerId,row.outcome,row.method,timestamp(row.receivedAt),timestamp(row.completedAt)])}/></details></article>
    </div>}
  </section>;
}
