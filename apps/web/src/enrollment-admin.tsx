import React,{useEffect,useRef,useState} from "react";
import {api} from "./api.js";
import {Notice} from "./notice.js";
import {Pagination} from "./pagination.js";
type Enrollment={enrollmentId:string;workerType:string;status:string;approvalStatus:string;nodeId?:string;createdAt:string};
export function EnrollmentAdmin({networks}:{networks:{id:string;name:string}[]}){
  const[networkId,setNetworkId]=useState(""),[items,setItems]=useState<Enrollment[]>([]),[page,setPage]=useState(1),[pages,setPages]=useState(1),[approval,setApproval]=useState<boolean|null>(null),[pending,setPending]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[credential,setCredential]=useState(""),[replacementLink,setReplacementLink]=useState("");
  const generation=useRef(0);
  const selected=networkId||networks[0]?.id||"";
  async function load(){if(!selected)return;const epoch=++generation.current;try{const [enrollments,admission]=await Promise.all([api(`/api/admin/networks/${selected}/enrollments?page=${page}&pageSize=10`),api(`/api/admin/networks/${selected}/admission`)]);if(epoch!==generation.current)return;setItems(enrollments.items);setPages(Math.max(1,enrollments.totalPages??1));if(page>Math.max(1,enrollments.totalPages??1))setPage(Math.max(1,enrollments.totalPages??1));setApproval(admission.requireAdminApproval);setError("");}catch(cause){if(epoch===generation.current)setError(cause instanceof Error?cause.message:"Unable to load enrollments.");}}
  useEffect(()=>{setItems([]);setApproval(null);setPage(1);setCredential("");setReplacementLink("");void load();},[selected]);
  useEffect(()=>{void load();},[page]);
  useEffect(()=>{if(!selected)return;const timer=setInterval(()=>void load(),10000);return()=>clearInterval(timer);},[selected,page]);
  async function action(run:()=>Promise<void>){if(pending)return;setPending(true);setError("");setMessage("");try{await run();await load();}catch(cause){setError(cause instanceof Error?cause.message:"The enrollment action failed.");}finally{setPending(false);}}
  const current=Math.min(page,pages);
  return <section className="card" aria-label="Enrollment approval and credentials"><h2>Enrollment approval and credentials</h2><p>New networks require administrator approval. Admission changes apply to new enrollments. A pending device cannot receive work.</p><label>Enrollment network<select value={selected} onChange={event=>setNetworkId(event.target.value)} disabled={pending}>{networks.map(network=><option key={network.id} value={network.id}>{network.name}</option>)}</select></label><Notice error={error} message={message}/>{!selected?<p>No networks available on this page.</p>:<><div className="actions"><button className="secondary" disabled={pending} onClick={()=>void load()}>Refresh enrollments</button><button role="switch" aria-label="Require administrator approval" aria-checked={approval===true} disabled={pending||approval===null} onClick={()=>action(async()=>{await api(`/api/admin/networks/${selected}/admission`,{method:"PATCH",body:JSON.stringify({requireAdminApproval:!approval})});setMessage("Admission approval policy saved for new enrollments.");})}>{approval===null?"Loading approval policyâ€¦":approval?"Approval required":"Automatic admission"}</button><button className="danger" disabled={pending} onClick={()=>action(async()=>{const result=await api(`/api/admin/networks/${selected}/rotate-join-link`,{method:"POST"});setReplacementLink(result.joinUrl);setMessage("Join link replaced. The previous invitation no longer admits devices. Existing worker credentials remain valid.");})}>Replace join link</button></div>{replacementLink&&<div className="notice"><p>Replacement invitation</p><code>{replacementLink}</code><button className="secondary" onClick={()=>setReplacementLink("")}>Hide invitation</button></div>}<div className="table-wrap"><table><thead><tr><th>Enrollment</th><th>Platform / node</th><th>Approval</th><th>Lifecycle</th><th>Actions</th></tr></thead><tbody>{items.map(item=><tr key={item.enrollmentId}><td><code>{item.enrollmentId}</code><br/><small>{new Date(item.createdAt).toLocaleString()}</small></td><td>{item.workerType}<br/><code>{item.nodeId??"Awaiting registration"}</code></td><td><span className="status">{item.approvalStatus}</span></td><td>{item.status}</td><td>{item.approvalStatus==="PENDING"?<><button disabled={pending} onClick={()=>action(async()=>{await api(`/api/admin/enrollments/${item.enrollmentId}/approval`,{method:"POST",body:JSON.stringify({approved:true})});setMessage("Enrollment approved. The device can reconnect.");})}>Approve</button> <button className="danger" disabled={pending} onClick={()=>action(async()=>{await api(`/api/admin/enrollments/${item.enrollmentId}/approval`,{method:"POST",body:JSON.stringify({approved:false})});setMessage("Enrollment rejected.");})}>Reject</button></>:item.status==="ACTIVE"&&item.workerType!=="BROWSER"?<button className="secondary" disabled={pending} onClick={()=>action(async()=>{const result=await api(`/api/admin/enrollments/${item.enrollmentId}/rotate-credential`,{method:"POST"});setCredential(result.workerCredential);setMessage("Credential rotated. The previous credential is invalid. Securely replace the credential on this device before reconnecting.");})}>Rotate worker credential</button>:"â€”"}</td></tr>)}{!items.length&&<tr><td colSpan={5}>No enrollments to review.</td></tr>}</tbody></table></div><Pagination page={current} totalPages={pages} onChange={setPage}/><p>Ten enrollments per page. Historical node and task records remain in their existing tables.</p><ScopedInvitations key={selected} networkId={selected}/>{credential&&<div className="notice"><p>Replacement private credential â€” shown only in this session. Do not put it in an invitation or public log.</p><code>{credential}</code><button className="secondary" onClick={()=>setCredential("")}>Hide private credential</button></div>}</>}</section>;
}

const workerPlatforms = {
  BROWSER: "Web",
  ANDROID: "Android",
  NATIVE: "Windows",
} as const;
type InvitationPlatform = keyof typeof workerPlatforms;
type Invitation = {
  id: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED" | "EXHAUSTED";
  expiresAt: string;
  createdAt: string;
  workerTypes: InvitationPlatform[];
  maxUses: number;
  usedCount: number;
  enrollmentId?: string | null;
  nodeId?: string | null;
};

type Redemption = {
  enrollmentId: string;
  nodeId?: string | null;
  workerType: InvitationPlatform;
  redeemedAt: string;
  status: string;
  approvalStatus: string;
};

function ScopedInvitations({networkId}: {networkId: string}) {
  const invitationPath = `/api/admin/networks/${encodeURIComponent(networkId)}/invitations`;
  const [items, setItems] = useState<Invitation[]>([]);
  const [ttlMinutes, setTtlMinutes] = useState("15");
  const [maxUses, setMaxUses] = useState("1");
  const [platforms, setPlatforms] = useState<InvitationPlatform[]>(
    Object.keys(workerPlatforms) as InvitationPlatform[]
  );
  const [created, setCreated] = useState<{id: string; joinUrl: string} | null>(null);
  const [history, setHistory] = useState<{id: string; items: Redemption[]} | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const linkInput = useRef<HTMLInputElement>(null);

  async function refresh(signal?: AbortSignal) {
    const response = await api(invitationPath, signal ? {signal} : {});
    if (!signal?.aborted) setItems(response.items);
  }

  useEffect(() => {
    const controller = new AbortController();
    setPending(true);
    void refresh(controller.signal).catch(cause => {
      if (!controller.signal.aborted) setError((cause as Error).message);
    }).finally(() => {
      if (!controller.signal.aborted) setPending(false);
    });
    return () => controller.abort();
  }, [invitationPath]);

  async function act(run: () => Promise<void>, reload = true) {
    if (pending) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      await run();
      if (reload) await refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function copyLink() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.joinUrl);
      setMessage("Invitation link copied.");
    } catch {
      linkInput.current?.focus();
      linkInput.current?.select();
      setMessage("Invitation link selected. Copy it using your keyboard or context menu.");
    }
  }

  function toggle(platform: InvitationPlatform, checked: boolean) {
    setPlatforms(current => checked ? [...current, platform] : current.filter(item => item !== platform));
  }

  return <section aria-label="Scoped invitations">
    <h3>Scoped invitations</h3>
    <p>Choose how many devices may enroll. Each device can redeem an invitation once.</p>
    <form onSubmit={event => {
      event.preventDefault();
      void act(async () => {
        const invitation = await api(invitationPath, {
          method: "POST",
          body: JSON.stringify({ttlMinutes: Number(ttlMinutes), maxUses: Number(maxUses), workerTypes: platforms}),
        });
        setCreated({id: invitation.id, joinUrl: invitation.joinUrl});
        setMessage("Invitation created.");
      });
    }}>
      <label>Invitation expires after (minutes)
        <input type="number" required min={1} max={1440} value={ttlMinutes}
          onChange={event => setTtlMinutes(event.target.value)} disabled={pending}/>
      </label>
      <label>Maximum invitation uses
        <input type="number" required min={1} max={100} value={maxUses}
          onChange={event => setMaxUses(event.target.value)} disabled={pending}/>
      </label>
      <fieldset disabled={pending}>
        <legend>Allowed worker platforms</legend>
        {Object.entries(workerPlatforms).map(([key, label]) => {
          const platform = key as InvitationPlatform;
          return <label key={platform}>
            <input type="checkbox" checked={platforms.includes(platform)}
              onChange={event => toggle(platform, event.target.checked)}/>{label}
          </label>;
        })}
      </fieldset>
      <button disabled={pending || platforms.length === 0} type="submit">Generate invitation</button>
    </form>
    <Notice error={error} message={message}/>
    {created && <div className="notice">
      <label>New invitation link
        <input ref={linkInput} readOnly value={created.joinUrl}/>
      </label>
      <button type="button" className="secondary" onClick={() => void copyLink()}>Copy invitation link</button>
      <button type="button" className="secondary" onClick={() => setCreated(null)}>Hide invitation link</button>
    </div>}
    <button type="button" className="secondary" disabled={pending} onClick={() => void act(async () => {})}>
      Refresh invitations
    </button>
    <div className="table-wrap">
      <table>
        <thead><tr><th>Invitation</th><th>Platforms</th><th>Status</th><th>Expires</th><th>Uses</th><th>First enrollment / node</th><th>Actions</th></tr></thead>
        <tbody>
          {items.map(item => <tr key={item.id}>
            <td><code>{item.id}</code><br/><small>{new Date(item.createdAt).toLocaleString()}</small></td>
            <td>{item.workerTypes.map(platform => workerPlatforms[platform]).join(", ")}</td>
            <td><span className="status">{item.status}</span></td>
            <td><time dateTime={item.expiresAt}>{new Date(item.expiresAt).toLocaleString()}</time></td>
            <td>{item.usedCount} / {item.maxUses}</td>
            <td>{item.enrollmentId ? <code>{item.enrollmentId}</code> : "â€”"}{item.nodeId && <><br/><code>{item.nodeId}</code></>}</td>
            <td>
              {item.usedCount > 0 && <button type="button" className="secondary" disabled={pending}
                onClick={() => void act(async () => {
                  const response = await api(`${invitationPath}/${encodeURIComponent(item.id)}/redemptions`);
                  setHistory({id: item.id, items: response.items});
                }, false)}>View redemptions</button>}
              {item.status === "ACTIVE" && <button type="button" className="danger" disabled={pending}
              onClick={() => void act(async () => {
                await api(`/api/admin/invitations/${encodeURIComponent(item.id)}/revoke`, {method: "POST"});
                setCreated(current => current?.id === item.id ? null : current);
                setMessage("Invitation revoked.");
              })}>Revoke invitation</button>}</td>
          </tr>)}
          {!items.length && <tr><td colSpan={6}>{pending ? "Loading invitationsâ€¦" : "No single-use invitations."}</td></tr>}
        </tbody>
      </table>
    </div>
    {history && <div className="notice">
      <p>Redemptions for <code>{history.id}</code></p>
      <button type="button" className="secondary" onClick={() => setHistory(null)}>Close redemptions</button>
      <ul>{history.items.map(item => <li key={item.enrollmentId}>
        <time dateTime={item.redeemedAt}>{new Date(item.redeemedAt).toLocaleString()}</time>{" "}
        {workerPlatforms[item.workerType]} <code>{item.enrollmentId}</code>{" "}
        {item.nodeId && <code>{item.nodeId}</code>} {item.approvalStatus} · {item.status}
      </li>)}</ul>
    </div>}
  </section>;
}
