import "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";
import {Pagination} from "./pagination.js";

const render=(page:number,totalPages:number)=>renderToStaticMarkup(<Pagination page={page} totalPages={totalPages} onChange={()=>{}}/>);
describe("server-backed table pagination",()=>{
  it("disables both directions when the server reports no pages",()=>{
    const html=render(1,0);
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Pagination"');
  });
  it("announces the current page to assistive technology",()=>{
    expect(render(2,3)).toContain('aria-current="page"');
    expect(render(2,3)).toContain('aria-label="Go to page 2"');
  });
  it("keeps controls bounded for large datasets while exposing first and last pages",()=>{
    const html=render(5000,10000);
    expect(html.match(/<button/g)?.length).toBeLessThanOrEqual(9);
    expect(html).toContain('aria-label="Go to page 1"');
    expect(html).toContain('aria-label="Go to page 10000"');
    expect(html).toContain('aria-label="Go to page 5000"');
  });
  it.each([[1,1,2],[1,3,1],[2,3,0],[3,3,1]])("respects boundary page %i of %i",(page,total,disabled)=>{
    expect(render(page,total).match(/disabled=""/g)?.length??0).toBe(disabled);
  });
});
