import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import {chromium,expect} from '@playwright/test';
import {assertIsolatedTarget,verifyIsolatedCoordinator} from './Integration-Target.mjs';
import {setTimeout as delay} from 'node:timers/promises';

const target=assertIsolatedTarget();
await verifyIsolatedCoordinator(target);
const origin=process.env.PUBLIC_BASE_URL;
const base=process.env.OMNICOMPILE_TEST_WEB_BASE;
if(!base||!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)||[4100,5173].includes(Number(new URL(base).port)))throw Error('Isolated web target required');
const route='/api/compilations/project-analysis';
async function post(path,body,cookie,retried=false){
  const r=await fetch(target.base+path,{method:'POST',headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  if(path===route&&r.status===429&&!retried){
    const seconds=Number(r.headers.get('retry-after'));
    assert(Number.isInteger(seconds)&&seconds>=1&&seconds<=60,'Expected bounded production rate-limit window');
    await r.arrayBuffer();
    console.log('Observed analysis rate limit; respecting its advertised retry window.');
    await delay((seconds+1)*1000);
    return post(path,body,cookie,true);
  }
  return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
const password='ProjectAnalysis!42',email=`project-${target.instance}@example.test`;
assert.equal((await post('/api/auth/signup',{name:'Project acceptance',email,password,confirmPassword:password})).status,201);
const owner=await post('/api/auth/login',{identifier:email,password});assert.equal(owner.status,200);
const admin=await post('/api/auth/login',{identifier:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD});assert.equal(admin.status,200);
const project={language:'c',entryPoint:'main.c',files:[{path:'main.c',content:'#include "helper.h"\nint main(void){return VALUE;}\n'},{path:'helper.h',content:'#define VALUE 0\n'}]};
assert.equal((await post(route,project)).status,401);
assert.equal((await post(route,project,admin.cookie)).status,403);
const pool=mysql.createPool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),database:target.database,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
let browser;
try{
  const counts=async()=>{const [[r]]=await pool.query('SELECT (SELECT COUNT(*) FROM compilation_jobs) jobs,(SELECT COUNT(*) FROM tasks) tasks');return r;};
  const before=await counts();
  const result=await post(route,project,owner.cookie);assert.equal(result.status,200);
  assert.equal(result.body.status,'REQUIRES_TOOLCHAIN_VALIDATION');
  assert.equal(result.body.sourceBytes,project.files.reduce((sum,f)=>sum+Buffer.byteLength(f.content),0));
  assert(result.body.files.find(f=>f.path==='main.c').dependencies.includes('helper.h'));
  assert(result.body.groups.findIndex(g=>g.includes('helper.h'))<result.body.groups.findIndex(g=>g.includes('main.c')));
  for(const language of ['python','java']){
    const files=language==='python'?[{path:'main.py',content:'import helper\n'},{path:'helper.py',content:'value=42\n'}]:[{path:'demo/Main.java',content:'package demo; public class Main { Helper value; }'},{path:'demo/Helper.java',content:'package demo; public class Helper {}'}];
    const r=await post(route,{language,files},owner.cookie);assert.equal(r.status,200);assert.equal(r.body.status,'REQUIRES_TOOLCHAIN_VALIDATION');assert.equal(r.body.files.length,2);
  }
  for(const path of ['../escape.c','/absolute.c','C:/drive.c','a\\b.c','a//b.c'])assert.equal((await post(route,{...project,files:[{path,content:'int main(void){return 0;}'}]},owner.cookie)).status,400);
  assert.equal((await post(route,{...project,files:[...project.files,project.files[0]]},owner.cookie)).status,400);
  assert.equal((await post(route,{...project,entryPoint:'missing.c'},owner.cookie)).status,400);
  assert.equal((await post(route,{language:'python',files:[{path:'main.py',content:'x'.repeat(1_000_001)}]},owner.cookie)).status,400);
  const missing=await post(route,{language:'c',files:[{path:'main.c',content:'#include "absent.h"\nint main(void){return 0;}'}]},owner.cookie);
  assert.equal(missing.status,200);assert.equal(missing.body.status,'REQUIRES_TOOLCHAIN_VALIDATION');assert(missing.body.diagnostics.some(d=>d.severity==='warning'));
  assert.deepEqual(await counts(),before,'Analysis must not create executable jobs or tasks');

  browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
  const page=await browser.newPage();await page.goto(base+'/login');
  await page.getByLabel('Username or email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/dashboard');
  const panel=page.getByRole('region',{name:'Project analysis',exact:true});
  await panel.getByLabel('Project files (32 files, 1 MB total)',{exact:true}).setInputFiles(project.files.map(f=>({name:f.path,mimeType:'text/plain',buffer:Buffer.from(f.content)})));
  await panel.getByRole('button',{name:'Analyze project',exact:true}).click();
  await expect(panel.getByText(/Requires toolchain validation/)).toBeVisible();
  await expect(panel.getByRole('list',{name:'Project dependencies'})).toContainText('helper.h');
  await expect(panel.getByRole('list',{name:'Dependency groups'})).toContainText('main.c');
  let writes=0;page.on('request',r=>{if(r.url().endsWith(route)&&r.method()==='POST')writes++;});
  await panel.getByLabel('Project files (32 files, 1 MB total)',{exact:true}).setInputFiles({name:'large.c',mimeType:'text/plain',buffer:Buffer.alloc(1_000_001,120)});
  await expect(panel.getByRole('alert')).toContainText('1 MB');assert.equal(writes,0,'Oversized selection must not reach analysis API');
  await expect(panel.getByRole('button',{name:'Analyze project',exact:true})).toBeDisabled();
  assert.deepEqual(await counts(),before);
  console.log('Actual isolated MySQL/coordinator/API and Edge project analysis passed: three languages, USER-only access, path/byte bounds, graph display, no executable admission and pre-read oversized rejection.');
}finally{await browser?.close();await pool.end();}
