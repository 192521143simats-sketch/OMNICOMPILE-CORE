import "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import {Notice} from "./notice.js";

describe("accessible operation feedback",()=>{
  it("announces failures as alerts without including unused success feedback",()=>{
    const html=renderToStaticMarkup(<Notice error="Request rejected."/>);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('role="status"');
  });
  it("announces success without interrupting screen readers as an error",()=>{
    const html=renderToStaticMarkup(<Notice message="Updated successfully."/>);
    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
  });
  it("does not render empty announcements",()=>{expect(renderToStaticMarkup(<Notice/>)).toBe("");});
  it("escapes feedback rather than interpreting HTML",()=>{
    const html=renderToStaticMarkup(<Notice error="<script>alert(1)</script>"/>);
    expect(html).not.toContain("<script>");expect(html).toContain("&lt;script&gt;");
  });
});
