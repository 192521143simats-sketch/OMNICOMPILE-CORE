// @vitest-environment jsdom
import {act,useState} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,describe,expect,it} from "vitest";
import {Pagination} from "./pagination.js";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root|undefined;
afterEach(async()=>{if(root)await act(async()=>root!.unmount());root=undefined;document.body.replaceChildren();});
describe("pagination state recovery in the React DOM",()=>{
  it("requests the remaining page after the final record on page two disappears",async()=>{
    const host=document.createElement("div");document.body.append(host);root=createRoot(host);
    function Table(){const[page,setPage]=useState(2);return <><output>{page}</output><Pagination page={page} totalPages={1} onChange={setPage}/></>;}
    await act(async()=>root!.render(<Table/>));
    expect(host.querySelector("output")?.textContent).toBe("1");
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe("1");
  });
  it("previous and next request the correct page without submitting an enclosing form",async()=>{
    const host=document.createElement("div");document.body.append(host);root=createRoot(host);
    function Table(){const[page,setPage]=useState(2);return <form><output>{page}</output><Pagination page={page} totalPages={3} onChange={setPage}/></form>;}
    await act(async()=>root!.render(<Table/>));
    const next=Array.from(host.querySelectorAll("button")).find(button=>button.textContent==="Next")!;
    expect(next.type).toBe("button");
    await act(async()=>next.click());
    expect(host.querySelector("output")?.textContent).toBe("3");
    const previous=Array.from(host.querySelectorAll("button")).find(button=>button.textContent==="Previous")!;
    await act(async()=>previous.click());
    expect(host.querySelector("output")?.textContent).toBe("2");
  });
});
