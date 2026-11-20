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
    <div className="landing-container">
      <header className="landing-header">
        <a href="/" className="brand"><span>OC</span> OmniCompile Core</a>
        <nav>
          <a href="/login" className="nav-link-login">Sign In</a>
          <a href="/signup" className="nav-link-signup">Get Started</a>
        </nav>
      </header>
      <main className="landing-hero">
        <div className="hero-content">
          <p className="hero-eyebrow">&gt; ZERO-TRUST DISTRIBUTED COMPILER PIPELINE</p>
          <h1>Hardware-Adaptive Distributed Compilation for Heterogeneous Edge-to-Cloud Orchestration</h1>
          <p className="hero-desc">
            OmniCompile Core seamlessly combines real C, Python, and Java compiler pipelines with intelligent, capability-aware scheduling across decentralized worker nodes and isolated cloud environments.
          </p>
          <div className="hero-actions">
            <a href="/login" className="btn-primary-red">Get Started</a>
            <a href="/signup" className="btn-secondary-outline">Create Account</a>
          </div>
        </div>
        <div className="hero-features">
          <div className="feature-card">
            <h3>Three Complete Pipelines</h3>
            <p>Independent processing and optimization for C, Python, and Java source code.</p>
          </div>
          <div className="feature-card">
            <h3>Zero-Trust Worker Network</h3>
            <p>Consent-based browser, Windows, and Android worker nodes securely enrolled via single admin links.</p>
          </div>
          <div className="feature-card">
            <h3>Smart Resource Scheduling</h3>
            <p>Automatically detects local capabilities and routes to local toolchains or isolated cloud toolchains.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
