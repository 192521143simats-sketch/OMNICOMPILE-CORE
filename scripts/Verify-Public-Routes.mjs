// Read-only deployment smoke: no accounts, enrollments, jobs or artifacts created.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from '@playwright/test';
const origin='https://omnicompile-core-platform.vercel.app';
const pages=[
  ['/',200,'OmniCompile Core'],
  ['/login',200,'Sign in'], ['/signup',200,'Create account'],
  ['/forgot-password',200,'Request password reset'], ['/reset-password',200,'Choose a new password'],
  ['/admin',200,'Sign in'], ['/dashboard',200,'Sign in'],
  ['/settings',200,'Sign in'], ['/compute',200,'Sign in'],
  ['/worker',200,'Worker platforms'], ['/worker/',200,'Worker platforms'],
  ['/web-worker',200,'Web worker'], ['/browser-worker',200,'Web worker'],
  ['/windows-worker',200,'Windows worker'], ['/android-worker',200,'Android worker'],
  ['/join/unknown-invitation',200,'Join a distributed network'],
  ['/join-network-a/unknown-invitation',200,'Join a distributed network'],
  ['/join-network-ab/unknown-invitation/windows',200,'Windows worker enrollment'],
  ['/join-network-a/unknown-invitation/android',200,'Android worker enrollment'],
  ['/join-network-a/unknown-invitation/web',200,'Web worker enrollment'],
  ['/join/unknown-invitation/web',200,'Web worker enrollment'],
  ['/join/unknown-invitation/windows',200,'Windows worker enrollment'],
  ['/join/unknown-invitation/android',200,'Android worker enrollment'],
  ['/this-page-does-not-exist',404,'Page not found'],
  ['/join/unknown-invitation/linux',404,'Page not found'],
];
const apis=[
  ['/api/auth/me',401], ['/api/user/settings',401], ['/api/user/compiler-metrics',401],
  ['/api/admin/overview',401], ['/api/admin/networks',401],
  ['/api/worker/me',401], ['/api/compilations/nonexistent-job',401],
  ['/api/join/unknown-invitation',404], ['/api/not-a-real-endpoint',404], ['/api',404],
];
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
const context=await browser.newContext(),page=await context.newPage(),errors=[],results=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  for(const [path,status,title] of pages){
    const response=await page.goto(origin+path,{waitUntil:'networkidle',timeout:60000});
    assert.equal(response.status(),status,path);
    await page.waitForFunction(expected=>document.title.includes(expected),title,{timeout:15000});
    const item={path,status:response.status(),title:await page.title(),finalPath:new URL(page.url()).pathname};
    if(path==='/worker/')assert.equal(item.finalPath,'/worker');
    if(path==='/browser-worker')assert.equal(item.finalPath,'/web-worker');
    results.push(item);
  }
  for(const [path,status] of apis){
    const response=await context.request.get(origin+path,{timeout:30000});
    assert.equal(response.status(),status,path);
    assert.match(response.headers()['content-type']??'',/application\/json/,path);
    await response.json();results.push({path,status,type:'application/json'});
  }
  assert.deepEqual(errors,[]);
  mkdirSync('.runtime/online-demo',{recursive:true});
  writeFileSync('.runtime/online-demo/page-route-audit.json',JSON.stringify({origin,checkedAt:new Date().toISOString(),results,browserErrors:errors},null,2));
  console.log(`PASS: ${pages.length} page routes and ${apis.length} backend API checks; no browser exceptions.`);
}finally{await browser.close();}
