// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,describe,expect,it,vi} from "vitest";
import {Login,Signup,Forgot,Reset,PasswordField,type AuthShellProps} from "./auth-pages.js";

// This suite exercises connected forms with mocked HTTP, independently of the
// public frontend's intentionally offline default configuration.
vi.mock('./backend-config.js',()=>({backendConfig:{mode:'remote',apiBaseUrl:null,wsBaseUrl:null},isBackendAvailable:()=>true}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root|undefined;
function Shell({children}:AuthShellProps){return <main>{children}</main>;}
async function render(element:React.ReactNode){const host=document.createElement("div");document.body.append(host);root=createRoot(host);await act(async()=>root!.render(element));return host;}
async function fill(host:HTMLElement,name:string,value:string){const labels:Record<string,RegExp>={name:/^Name/,email:/^Email/,password:/^(New password|Password)/,confirmPassword:/^Confirm password/};const label=Array.from(host.querySelectorAll("label")).find(item=>labels[name]!.test(item.textContent??""))!;const input=label.control as HTMLInputElement;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true}));});}
async function submit(host:HTMLElement){await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));}
function response(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});}
afterEach(async()=>{if(root)await act(async()=>root!.unmount());root=undefined;document.body.replaceChildren();vi.unstubAllGlobals();history.replaceState({},"","/");});

// These tests exercise real React forms and api(), with only HTTP transport replaced.
describe("auth forms in the React DOM",()=>{
  it("shows forgot-password transport errors and enables retry",async()=>{
    vi.stubGlobal("fetch",async()=>response({error:{message:"Try again later."}},429));
    const host=await render(<Forgot Shell={Shell}/>);
    await submit(host);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Try again later.");
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
  });
  it.each([{name:"login",Page:Login},{name:"signup",Page:Signup},{name:"forgot",Page:Forgot},{name:"reset",Page:Reset}])("blocks a second pending $name request and announces progress",async({Page})=>{
    history.replaceState({},"","/reset-password?token=12345678901234567890");
    let requests=0,resolve!:(r:Response)=>void;
    vi.stubGlobal("fetch",()=>{requests++;return new Promise<Response>(done=>resolve=done);});
    const host=await render(<Page Shell={Shell}/>);
    if(Page===Signup){await fill(host,"name","Test User");await fill(host,"email","test@example.com");}
    if(Page===Signup||Page===Reset){await fill(host,"password","SecurePassword1!");await fill(host,"confirmPassword","SecurePassword1!");}
    await act(async()=>{host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});
    expect(requests).toBe(1);
    expect(host.querySelector('form')?.getAttribute("aria-busy")).toBe("true");
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    expect(host.querySelector('[role="status"]')?.textContent).toMatch(/…/);
    await act(async()=>resolve(response({error:{message:"Try again."}},503)));
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Try again.");
  });
  it("keeps weak or mismatched signup passwords out of HTTP and focuses the error",async()=>{
    let requests=0;vi.stubGlobal("fetch",async()=>{requests++;return response({});});
    const host=await render(<Signup Shell={Shell}/>);
    await fill(host,"password","short");await fill(host,"confirmPassword","short");await submit(host);
    expect(requests).toBe(0);expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/12/);
    expect(document.activeElement).toBe(host.querySelector('[role="alert"]'));
    await fill(host,"password","SecurePassword1!");await submit(host);
    expect(requests).toBe(0);expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/match/);
  });
  it("redirects signup and reset to the common login after success",async()=>{
    const paths:string[]=[];vi.stubGlobal("fetch",async()=>response({message:"Success",user:{id:"u",name:"Test User",email:"test@example.com",role:"USER"}}));
    let host=await render(<Signup Shell={Shell} navigate={path=>paths.push(path)}/>);
    await fill(host,"password","SecurePassword1!");await fill(host,"confirmPassword","SecurePassword1!");await submit(host);
    expect(paths).toEqual(["/login?created=1"]);
    await act(async()=>root!.unmount());root=undefined;history.replaceState({},"","/reset-password?token=12345678901234567890");
    host=await render(<Reset Shell={Shell} navigate={path=>paths.push(path)}/>);
    await fill(host,"password","SecurePassword1!");await fill(host,"confirmPassword","SecurePassword1!");await submit(host);
    expect(paths).toEqual(["/login?created=1","/login?reset=1"]);
  });
  it.each(["ADMIN","USER"])("uses one login and routes %s based on the returned role",async(role)=>{
    const paths:string[]=[];vi.stubGlobal("fetch",async()=>response({user:{id:"u",name:"User",email:"u@example.com",role},expiresAt:"2030-01-01"}));
    const host=await render(<Login Shell={Shell} navigate={path=>paths.push(path)}/>);await submit(host);
    expect(paths).toEqual([role==="ADMIN"?"/admin":"/dashboard"]);
  });
  it("shows expired reset failures with a new-request link",async()=>{
    history.replaceState({},"","/reset-password?token=12345678901234567890");
    vi.stubGlobal("fetch",async()=>response({error:{message:"The reset link is invalid, expired, or already used."}},410));
    const host=await render(<Reset Shell={Shell}/>);await fill(host,"password","SecurePassword1!");await fill(host,"confirmPassword","SecurePassword1!");await submit(host);
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/expired/);
    expect(host.querySelector('a[href="/forgot-password"]')).not.toBeNull();
  });
  it("eye control reveals the current password without submitting the form",async()=>{
    const host=await render(<form><PasswordField label="Password" value="secret" onChange={()=>{}} autoComplete="current-password"/></form>);
    const toggle=host.querySelector("button")!;expect(toggle.type).toBe("button");await act(async()=>toggle.click());
    expect(host.querySelector("input")?.type).toBe("text");expect(toggle.getAttribute("aria-pressed")).toBe("true");expect(toggle.getAttribute("aria-label")).toBe("Hide password");
  });
  it("treats an incomplete reset-request response as a visible failure",async()=>{
    vi.stubGlobal("fetch",async()=>response({}));const host=await render(<Forgot Shell={Shell}/>);await submit(host);
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/invalid response/i);
  });
  it("does not submit reset credentials without a usable token",async()=>{
    let requests=0;vi.stubGlobal("fetch",async()=>{requests++;return response({});});
    const host=await render(<Reset Shell={Shell}/>);await submit(host);
    expect(requests).toBe(0);expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/invalid/);
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
  });
  it("sends signup through the existing HTTP contract with cookie credentials and no persisted secrets",async()=>{
    const requests:Array<{path:string;options:RequestInit}>=[];
    vi.stubGlobal("fetch",async(path:string,options:RequestInit)=>{requests.push({path,options});return response({user:{id:"u",name:"Test User",email:"test@example.com",role:"USER"}},201);});
    const host=await render(<Signup Shell={Shell} navigate={()=>{}}/>);
    await fill(host,"name"," Test User ");await fill(host,"email","test@example.com");await fill(host,"password","SecurePassword1!");await fill(host,"confirmPassword","SecurePassword1!");await submit(host);
    expect(requests).toHaveLength(1);expect(requests[0]!.path).toBe("/api/auth/signup");expect(requests[0]!.options.credentials).toBe("include");expect(requests[0]!.options.method).toBe("POST");
    expect(JSON.parse(String(requests[0]!.options.body))).toEqual({name:"Test User",email:"test@example.com",password:"SecurePassword1!",confirmPassword:"SecurePassword1!"});
    expect(localStorage.length).toBe(0);expect(sessionStorage.length).toBe(0);
    expect(host.querySelector<HTMLInputElement>('[name="name"]')?.autocomplete).toBe("name");expect(host.querySelector<HTMLInputElement>('[name="email"]')?.maxLength).toBe(320);
    expect(host.querySelector<HTMLInputElement>('[name="password"]')?.maxLength).toBe(200);expect(host.querySelector<HTMLInputElement>('[name="confirmPassword"]')?.autocomplete).toBe("new-password");
  });
});
