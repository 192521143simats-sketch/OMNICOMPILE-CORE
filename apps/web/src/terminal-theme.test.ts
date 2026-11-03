import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {JSDOM} from "jsdom";
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
it("web and Windows explicitly opt into the permanent exact dark palette",()=>{
  for(const path of ["./terminal.css","../../windows-worker/style.css"]){const css=read(path);expect(css).toContain("color-scheme:dark");for(const color of ["#FF4D2E","#0C0D10","#FFFFFF","#D9D9D9"])expect(css).toContain(color);expect(css).not.toContain("prefers-color-scheme");}
});
it("keeps dense live values readable and long headings contained without changing the layout",()=>{
  const dom=new JSDOM('<!doctype html><html><head></head><body><main><section><div class="section-title"><h2>Live workers</h2></div><table><thead><tr><th>Last heartbeat</th></tr></thead></table><div class="metric"><strong>12345</strong></div><button disabled>Compiling</button></section></main></body></html>');
  try{
    const style=dom.window.document.createElement('style');
    style.textContent=read('./styles.css')+read('./platform.css')+read('./compiler.css')+read('./auth.css')+read('./terminal.css');
    dom.window.document.head.append(style);
    const computed=(selector:string)=>dom.window.getComputedStyle(dom.window.document.querySelector(selector)!);
    expect(computed('.metric strong').fontVariantNumeric).toBe('tabular-nums');
    expect(computed('.section-title h2').overflowWrap).toBe('anywhere');
    expect(computed('th').whiteSpace).toBe('nowrap');
    expect(computed('button').transform).toBe('none');
  }finally{dom.window.close();}
// Full-sheet JSDOM cascade evaluation is a correctness fixture, not a browser
// latency benchmark; allow bounded headroom on memory-constrained build hosts.
},15_000);
it("keeps the compiler form compact beside a longer compilation result",()=>{
  const dom=new JSDOM('<!doctype html><html><head></head><body><div class="grid two"><form class="card compiler-form"><label>Source<textarea></textarea></label><button>Compile and optimize</button></form><section>Long result</section></div></body></html>');
  try{
    const style=dom.window.document.createElement('style');
    style.textContent=read('./styles.css')+read('./compiler.css')+read('./terminal.css');
    dom.window.document.head.append(style);
    const form=dom.window.getComputedStyle(dom.window.document.querySelector('form')!);
    expect(form.alignSelf).toBe('start');
    expect(form.alignContent).toBe('start');
  }finally{dom.window.close();}
});
it("Android uses carbon system bars even in the light resource configuration",()=>{
  const xml=read("../../android-worker/app/src/main/res/values/themes.xml");expect(xml).toContain("#0C0D10");expect(xml).toContain('name="worker_light_bars">false');
  const theme=read("../../android-worker/app/src/main/java/org/omnicompile/worker/WorkerTheme.kt");expect(theme).not.toContain("isSystemInDarkTheme");expect(theme).not.toContain("lightColorScheme");
});
