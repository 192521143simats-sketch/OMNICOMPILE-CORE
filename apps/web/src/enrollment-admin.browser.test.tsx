// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
import {EnrollmentAdmin} from "./enrollment-admin.js";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
it("loads pending enrollments and approves only through the administrator endpoint",async()=>{
  const request=vi.fn(async(input:string,init?:RequestInit)=>new Response(JSON.stringify(input.endsWith('/admission')?{requireAdminApproval:true}:input.endsWith('/invitations')?{items:[]}:init?.method==='POST'?{enrollmentId:'e1',approvalStatus:'APPROVED'}:{items:[{enrollmentId:'e1',workerType:'ANDROID',status:'ACTIVE',approvalStatus:'PENDING',createdAt:'2026-10-16T00:00:00Z'}]}),{headers:{'content-type':'application/json'}}));
  vi.stubGlobal('fetch',request);const host=document.createElement('div'),root=createRoot(host);document.body.append(host);
  try{await act(async()=>root.render(<EnrollmentAdmin networks={[{id:'n1',name:'Lab'}]}/>));expect(host.textContent).toContain('PENDING');const approve=Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='Approve');expect(approve).toBeDefined();await act(async()=>approve!.click());expect(request.mock.calls.some(([path,init])=>path==='/api/admin/enrollments/e1/approval'&&init?.body===JSON.stringify({approved:true}))).toBe(true);}finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});


it("creates a one-use link, confirms copying, refreshes status and revokes only unused invitations", async () => {
  const createdAt = "2026-10-16T00:00:00Z";
  const expiresAt = "2026-10-16T00:15:00Z";
  const invitationPath = "/api/admin/networks/n1/invitations";
  const joinUrl = "https://example.test/join/fixture-invitation";
  const consumed = {
    id: "used",
    status: "EXHAUSTED",
    expiresAt,
    createdAt,
    workerTypes: ["ANDROID"],
    enrollmentId: "ENROLLMENT-1",
    nodeId: "NODE-A001",
  };
  let status = "";
  const request = vi.fn(async (path: string, options?: RequestInit) => {
    if (path === invitationPath && options?.method === "POST") {
      status = "ACTIVE";
      return Response.json({id: "created", joinUrl, expiresAt}, {status: 201});
    }
    if (path === "/api/admin/invitations/created/revoke") {
      status = "REVOKED";
      return new Response(null, {status: 204});
    }
    if (path === invitationPath) {
      const created = {id: "created", status, expiresAt, createdAt, workerTypes: ["BROWSER", "ANDROID", "NATIVE"]};
      return Response.json({items: status ? [consumed, created] : [consumed]});
    }
    if (path.endsWith("/admission")) return Response.json({requireAdminApproval: true});
    return Response.json({items: [], totalPages: 1});
  });
  const clipboard = vi.fn(async () => {});
  const savedClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {configurable: true, value: {writeText: clipboard}});
  vi.stubGlobal("fetch", request);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const button = (name: string) => Array.from(host.querySelectorAll("button"))
    .find(element => element.textContent?.trim() === name);
  try {
    await act(async () => root.render(<EnrollmentAdmin networks={[{id: "n1", name: "Lab"}]}/>));
    expect(host.textContent).toContain("EXHAUSTED");
    expect(host.textContent).toContain("ENROLLMENT-1");
    expect(host.textContent).toContain("NODE-A001");
    expect(button("Revoke invitation")).toBeUndefined();
    await act(async () => button("Generate invitation")!.click());
    expect(request.mock.calls).toEqual(expect.arrayContaining([[invitationPath, expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ttlMinutes: 15, workerTypes: ["BROWSER", "ANDROID", "NATIVE"]}),
    })]]));
    expect(host.querySelector<HTMLInputElement>("input[readonly]")?.value).toBe(joinUrl);
    await act(async () => button("Copy invitation link")!.click());
    expect(clipboard).toHaveBeenCalledWith(joinUrl);
    expect(host.textContent).toContain("Invitation link copied.");
    await act(async () => button("Revoke invitation")!.click());
    expect(host.textContent).toContain("REVOKED");
    expect(host.querySelector("input[readonly]")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    if (savedClipboard) Object.defineProperty(navigator, "clipboard", savedClipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});
