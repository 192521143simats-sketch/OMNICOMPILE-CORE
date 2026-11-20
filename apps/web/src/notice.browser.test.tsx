// @vitest-environment jsdom
import React,{act,StrictMode} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {Notice} from "./notice.js";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root;let host:HTMLDivElement;
beforeEach(()=>{vi.useFakeTimers();host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();delete document.documentElement.dataset.reducedMotion;vi.unstubAllGlobals();vi.useRealTimers();});
async function show(error?:string,message?:string){await act(async()=>root.render(<StrictMode><Notice error={error??""} message={message??""}/></StrictMode>));}
async function tick(ms:number){await act(async()=>vi.advanceTimersByTime(ms));}
it("keeps active notices indefinitely, then immediately clears announcements and removes visual text after 200ms",async()=>{
 await show("Failure","Saved");await tick(60000);
 expect(host.querySelector('[role=alert]')?.textContent).toBe("Failure");expect(host.querySelector('[role=status]')?.textContent).toBe("Saved");
 await show();expect(host.querySelector('[role=alert],[role=status]')).toBeNull();
 expect(host.querySelectorAll('.notice-leaving[aria-hidden=true][inert]')).toHaveLength(2);
 await tick(199);expect(host.textContent).toBe("FailureSaved");await tick(1);expect(host.textContent).toBe("");
});
it("replaces messages immediately and cancels stale removal timers",async()=>{
 await show(undefined,"A");await show();await tick(100);await show(undefined,"B");
 expect(host.textContent).toBe("B");expect(host.querySelector('[role=status]')?.textContent).toBe("B");await tick(200);expect(host.textContent).toBe("B");
 await show(undefined,"C");expect(host.textContent).toBe("C");
});
it("cleans up pending removal on unmount",async()=>{
 await show("A","B");await show();expect(vi.getTimerCount()).toBe(2);
 await act(async()=>root.unmount());expect(vi.getTimerCount()).toBe(0);root=createRoot(host);
});
it.each(["app","os"])("skips retained visuals with %s reduced motion",async(mode)=>{
 if(mode==="app")document.documentElement.dataset.reducedMotion="true";
 else vi.stubGlobal("matchMedia",()=>({matches:true}));
 await show("Failure","Saved");await show();expect(host.textContent).toBe("");expect(vi.getTimerCount()).toBe(0);
});

