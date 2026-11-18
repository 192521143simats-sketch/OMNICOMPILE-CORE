// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
import {AdminToolchains} from "./admin-toolchains.js";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;

it("reports live slot counts on refresh and preserves unknown capacity",async()=>{
  const path="/api/admin/executions";
  const fetchStatus=vi.fn()
    .mockResolvedValueOnce(Response.json({provider:"kubernetes",items:[],capacity:{busy:0,limit:2}}))
    .mockResolvedValueOnce(Response.json({provider:"kubernetes",items:[{
      id:"cleanup",language:"c",kind:"task",state:"CLEANUP_PENDING",createdAt:"2026-10-16T00:00:00Z",finishedAt:null
    }],capacity:{busy:1,limit:2}}))
    .mockResolvedValueOnce(Response.json({provider:"kubernetes",items:[],capacity:{busy:2,limit:2}}))
    .mockResolvedValueOnce(Response.json({provider:"kubernetes",items:[]}))
    .mockResolvedValueOnce(Response.json({provider:"kubernetes",items:[],capacity:null}))
    .mockResolvedValueOnce(Response.json({provider:"docker",items:[],capacity:{busy:1,limit:2}}))
    .mockResolvedValueOnce(Response.json({error:{message:"Execution history is unavailable."}},{status:503}));
  const host=document.createElement("div");
  const root=createRoot(host);
  vi.stubGlobal("fetch",fetchStatus);
  const refresh=async()=>{
    const button=Array.from(host.querySelectorAll("button")).find(node=>node.textContent==="Refresh executions")!;
    await act(async()=>button.click());
  };
  try{
    await act(async()=>root.render(<AdminToolchains/>));
    expect(host.textContent).toContain("Fixed execution capacity · 0 / 2 busy · 2 available");
    for(const value of ["1 / 2 busy · 1 available","2 / 2 busy · 0 available","Unavailable","Unavailable","1 / 2 busy · 1 available","Unavailable"]){
      await refresh();
      expect(host.textContent).toContain("Fixed execution capacity · "+value);
      if(value==="1 / 2 busy · 1 available"&&fetchStatus.mock.calls.length===2)expect(host.textContent).toContain("Cleanup pending");
    }
    expect(fetchStatus.mock.calls.map(([url])=>url)).toEqual(Array(7).fill(path));
    expect(host.textContent).toContain("Execution history is unavailable.");
    expect(host.textContent).not.toContain("1 / 2 busy");
  }finally{
    await act(async()=>root.unmount());
    vi.unstubAllGlobals();
  }
});


it("polls every ten seconds while visible and clears polling on unmount",async()=>{
  vi.useFakeTimers();
  const visibility=vi.spyOn(document,"visibilityState","get").mockReturnValue("visible");
  let completeRequest:((response:Response)=>void)|undefined;
  const fetchStatus=vi.fn(()=>new Promise<Response>(resolve=>{completeRequest=resolve;}));
  const host=document.createElement("div");
  const firstResponse=()=>Response.json({provider:"docker",items:[],capacity:{busy:1,limit:2}});
  const root=createRoot(host);
  vi.stubGlobal("fetch",fetchStatus);
  try{
    await act(async()=>root.render(<AdminToolchains/>));
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    await act(async()=>vi.advanceTimersByTime(10_000));
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    await act(async()=>completeRequest?.(firstResponse()));
    expect(host.textContent).toContain("1 / 2 busy");
    visibility.mockReturnValue("hidden");
    await act(async()=>vi.advanceTimersByTime(10_000));
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    visibility.mockReturnValue("visible");
    await act(async()=>vi.advanceTimersByTime(10_000));
    expect(fetchStatus).toHaveBeenCalledTimes(2);
    await act(async()=>completeRequest?.(Response.json({provider:"docker",items:[],capacity:{busy:0,limit:2}})));
    expect(host.textContent).toContain("0 / 2 busy");
  }finally{
    await act(async()=>root.unmount());
    await act(async()=>vi.advanceTimersByTime(10_000));
    vi.useRealTimers();
    visibility.mockRestore();
    vi.unstubAllGlobals();
  }
  expect(fetchStatus).toHaveBeenCalledTimes(2);
});
