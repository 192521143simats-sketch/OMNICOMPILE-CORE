import React,{useEffect,useId,useRef,useState} from "react";
import {api} from "./api.js";
import {Notice} from "./notice.js";
import "./auth.css";

export type AuthShellProps={title:string;subtitle:string;children:React.ReactNode};
export type AuthPageProps={Shell:React.ComponentType<AuthShellProps>;navigate?:(path:string)=>void};
const go=(path:string)=>{location.href=path;};
const passwordHelp="Use 12–200 characters with uppercase, lowercase, a number, and a symbol.";
function passwordError(password:string,confirmation:string){
  if(password.length<12||password.length>200||!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password)||!/[^A-Za-z0-9]/.test(password))return passwordHelp;
  return password===confirmation?"":"The passwords do not match.";
}
// The ref guards same-turn duplicate submissions before React renders pending state.
function useAuthRequest(){
  const active=useRef(false),[pending,setPending]=useState(false),[error,setError]=useState("");
  async function run(operation:()=>Promise<void>,validation=""){
    if(active.current)return;
    setError("");
    if(validation){setError(validation);return;}
    active.current=true;setPending(true);
    try{await operation();}catch(cause){setError(cause instanceof Error?cause.message:"The request failed. Please try again.");}
    finally{active.current=false;setPending(false);}
  }
  return{pending,error,run};
}
function AuthFeedback({error,message}:{error:string;message?:string}){
  const host=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(error){const alert=host.current?.querySelector<HTMLElement>('[role="alert"]');if(alert){alert.tabIndex=-1;alert.focus();}}},[error]);
  return <div ref={host}><Notice error={error} message={message??""}/></div>;
}
export function PasswordField({label,value,onChange,autoComplete="new-password",name="password",describedBy,disabled=false}:{label:string;value:string;onChange:(value:string)=>void;autoComplete?:string;name?:string;describedBy?:string;disabled?:boolean}){
  const[visible,setVisible]=useState(false),id=useId();
  return <div className="auth-password"><label htmlFor={id}>{label}</label><span className="password-field"><input id={id} name={name} type={visible?"text":"password"} autoComplete={autoComplete} aria-describedby={describedBy} maxLength={200} value={value} onChange={event=>onChange(event.target.value)} disabled={disabled} required/><button type="button" className="password-toggle" aria-controls={id} aria-label={`${visible?"Hide":"Show"} ${label.toLowerCase()}`} aria-pressed={visible} onClick={()=>setVisible(!visible)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{!visible&&<path d="M3 21 21 3"/>}</svg></button></span></div>;
}
export function Login({Shell,navigate=go}:AuthPageProps){
  const[identifier,setIdentifier]=useState(""),[password,setPassword]=useState(""),request=useAuthRequest();
  const query=new URLSearchParams(location.search),notice=query.has("reset")?"Password updated. Sign in with your new password.":query.has("created")?"Account created. You can now sign in.":query.has("session")?"Your session ended. Sign in to continue.":"";
  function submit(event:React.FormEvent){event.preventDefault();void request.run(async()=>{const{user}=await api("/api/auth/login",{method:"POST",body:JSON.stringify({identifier:identifier.trim(),password})});if(!user||!["ADMIN","USER"].includes(user.role))throw new Error("The service returned an invalid login response. Please try again.");navigate(user.role==="ADMIN"?"/admin":"/dashboard");});}
  return <Shell title="Welcome back" subtitle="One secure login serves both administrator and user roles."><form className="card auth-card" onSubmit={submit} aria-busy={request.pending}><label>Username or email<input name="identifier" autoComplete="username" maxLength={320} value={identifier} onChange={e=>setIdentifier(e.target.value)} disabled={request.pending} required/></label><PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" disabled={request.pending}/><AuthFeedback error={request.error} message={request.pending?"Signing in…":request.error?"":notice}/><button type="submit" disabled={request.pending}>{request.pending?"Signing in…":"Sign in"}</button><p><a href="/forgot-password">Forgot password?</a> · <a href="/signup">Create user account</a></p></form></Shell>;
}
export function Signup({Shell,navigate=go}:AuthPageProps){
  const[form,setForm]=useState({name:"",email:"",password:"",confirmPassword:""}),request=useAuthRequest(),helpId=useId();
  function submit(event:React.FormEvent){event.preventDefault();void request.run(async()=>{await api("/api/auth/signup",{method:"POST",body:JSON.stringify({...form,name:form.name.trim(),email:form.email.trim()})});navigate("/login?created=1");},passwordError(form.password,form.confirmPassword));}
  return <Shell title="Create your OmniCompile Core account" subtitle="Your jobs and artifacts remain private to your authenticated account."><form className="card auth-card" onSubmit={submit} aria-busy={request.pending}><label>Name<input name="name" autoComplete="name" minLength={2} maxLength={120} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} disabled={request.pending} required/></label><label>Email<input name="email" type="email" autoComplete="email" maxLength={320} value={form.email} onChange={e=>setForm({...form,email:e.target.value})} disabled={request.pending} required/></label><PasswordField label="Password" value={form.password} onChange={value=>setForm({...form,password:value})} describedBy={helpId} disabled={request.pending}/><PasswordField label="Confirm password" name="confirmPassword" value={form.confirmPassword} onChange={value=>setForm({...form,confirmPassword:value})} describedBy={helpId} disabled={request.pending}/><p className="muted" id={helpId}>{passwordHelp}</p><AuthFeedback error={request.error} message={request.pending?"Creating account…":""}/><button type="submit" disabled={request.pending}>{request.pending?"Creating account…":"Create account"}</button><p>Already registered? <a href="/login">Sign in</a></p></form></Shell>;
}
export function Forgot({Shell}:AuthPageProps){
  const[email,setEmail]=useState(""),[message,setMessage]=useState(""),[resetUrl,setResetUrl]=useState(""),request=useAuthRequest();
  function submit(event:React.FormEvent){event.preventDefault();void request.run(async()=>{setMessage("");setResetUrl("");const result=await api("/api/auth/forgot-password",{method:"POST",body:JSON.stringify({email:email.trim()})});if(typeof result?.message!=="string"||!result.message.trim())throw new Error("The service returned an invalid response. Please try again.");setMessage(result.message);setResetUrl(result.developmentResetUrl??"");});}
  return <Shell title="Reset your password" subtitle="Reset requests are short-lived and do not reveal whether an account exists."><form className="card auth-card" onSubmit={submit} aria-busy={request.pending}><label>Email<input name="email" type="email" autoComplete="email" maxLength={320} value={email} onChange={e=>setEmail(e.target.value)} disabled={request.pending} required/></label><button type="submit" disabled={request.pending}>{request.pending?"Requesting reset…":"Request reset"}</button><AuthFeedback error={request.error} message={request.pending?"Requesting reset…":message}/>{resetUrl&&<a href={resetUrl}>Open local development reset link</a>}<p><a href="/login">Back to sign in</a></p></form></Shell>;
}
export function Reset({Shell,navigate=go}:AuthPageProps){
  const token=new URLSearchParams(location.search).get("token")??"",[password,setPassword]=useState(""),[confirmPassword,setConfirm]=useState(""),request=useAuthRequest(),helpId=useId(),missingToken=token.length<20||token.length>200;
  function submit(event:React.FormEvent){event.preventDefault();void request.run(async()=>{await api("/api/auth/reset-password",{method:"POST",body:JSON.stringify({token,password,confirmPassword})});navigate("/login?reset=1");},missingToken?"This reset link is invalid. Request a new link.":passwordError(password,confirmPassword));}
  return <Shell title="Choose a new password" subtitle="Using this link revokes your existing login sessions."><form className="card auth-card" onSubmit={submit} aria-busy={request.pending}><PasswordField label="New password" value={password} onChange={setPassword} describedBy={helpId} disabled={request.pending||missingToken}/><PasswordField label="Confirm password" name="confirmPassword" value={confirmPassword} onChange={setConfirm} describedBy={helpId} disabled={request.pending||missingToken}/><p className="muted" id={helpId}>{passwordHelp}</p><AuthFeedback error={request.error||(missingToken?"This reset link is invalid. Request a new link.":"")} message={request.pending?"Updating password…":""}/><button type="submit" disabled={request.pending||missingToken}>{request.pending?"Updating password…":"Update password"}</button><p><a href="/forgot-password">Request a new reset link</a> · <a href="/login">Sign in</a></p></form></Shell>;
}
