import {CompilerMetrics} from "./compiler-metrics.js";
import React,{useEffect,useMemo,useRef,useState} from "react";
import {createRoot} from "react-dom/client";
import {BrowserNode} from "./browser-node.js";
import "./styles.css";import "./compiler.css";import "./platform.css";
import {CompilationFeedback,needsCompilationUpdate} from "./compilation-feedback.js";
import {Pagination} from "./pagination.js";
import {api} from "./api.js";
import {Notice} from "./notice.js";
import {AdminInspector} from "./admin-inspector.js";
import {EnrollmentAdmin} from "./enrollment-admin.js";
import {AdminToolchains} from "./admin-toolchains.js";
import {WorkerInstallation,type DistributionPlatform} from "./worker-installation.js";
import {joinAllowsPlatform,joinPath,parseJoinRoute,WorkerChoices,type JoinPlatform,type JoinWorkerType} from "./worker-onboarding.js";
import {Login,Signup,Forgot,Reset} from "./auth-pages.js";
import "./terminal.css";
import "./landing.css";

type User={id:string;name:string;email:string;role:"ADMIN"|"USER"};
type Page<T>={items:T[];page:number;pageSize:number;totalItems:number;totalPages:number};
const go=(path:string)=>{location.href=path;};
const statusClass=(status:string)=>`status status-${status.toLowerCase()}`;

function Header({user}:{user?:User|null|undefined}){useEffect(()=>{let active=true;if(user)api("/api/user/settings").then(preferences=>{if(active)document.documentElement.dataset.reducedMotion=String(preferences.reducedMotion);}).catch(()=>{});return()=>{active=false;};},[user?.id]);const[logoutError,setLogoutError]=useState("");async function logout(){try{await api("/api/auth/logout",{method:"POST"});go("/login");}catch(cause){setLogoutError(cause instanceof Error?cause.message:"Unable to sign out.");}}return <><a className="skip-link" href="#main-content">Skip to content</a><header><a href="/" className="brand"><span>OC</span> OmniCompile Core</a><nav>{user?.role==="ADMIN"?<><a href="/admin">Admin</a><button className="link-button" onClick={logout}>Logout</button></>:user?<><a href="/dashboard">Compiler</a><button className="link-button" onClick={logout}>Logout</button></>:<a href="/login">Login</a>}</nav></header>{logoutError&&<Notice error={logoutError}/>}</>}
function Shell({user,title,subtitle,children}:{user?:User|null|undefined;title:string;subtitle:string;children:React.ReactNode}){return <><Header user={user}/><main id="main-content" tabIndex={-1}><div className="heading"><p className="eyebrow">Distributed compute platform</p><h1>{title}</h1><p>{subtitle}</p></div>{children}</main></>}
function Metric({name,value}:{name:string;value:React.ReactNode}){return <div className="metric"><span>{name}</span><strong>{value}</strong></div>}

function Home(){
  return (
    <div className="cinematic-landing">
      <div className="bg-glow-layer" />
      <div className="orbital-circle circle-1" />
      <div className="orbital-circle circle-2" />
      <div className="orbital-circle circle-3" />

      <header className="cinematic-header">
        <a href="/" className="brand"><span>OC</span> OmniCompile Core</a>
      </header>

      <main className="cinematic-hero">
        <div className="hero-inner">
          <p className="eyebrow-cinematic">&gt; ZERO-TRUST DISTRIBUTED COMPILATION</p>
          <h1 className="hero-headline">Compile Without Limits.</h1>
          <p className="hero-subtitle">Intelligent compilation. Distributed execution. Secure optimization.</p>
          <p className="hero-description">
            A unified compilation platform connecting distributed nodes to compile, optimize and execute code across heterogeneous environments.
          </p>

          <div className="cta-container">
            <a href="/login" className="btn-get-started">
              GET STARTED <span>→</span>
            </a>
          </div>
        </div>

        <div className="cinematic-divider-wrap">
          <div className="side-label left">
            <span className="label-title">DISTRIBUTED COMPUTING</span>
            <span className="label-sub">Cross-platform execution</span>
          </div>
          <div className="divider-line">
            <div className="divider-glow" />
          </div>
          <div className="side-label right">
            <span className="label-title">INTELLIGENT OPTIMIZATION</span>
            <span className="label-sub">Multi-language compilation</span>
          </div>
        </div>
      </main>

      <footer className="cinematic-footer">
        <p>OMNICOMPILE CORE &bull; Distributed compiler infrastructure built for Windows, Web, and Android workers.</p>
      </footer>
    </div>
  );
}
