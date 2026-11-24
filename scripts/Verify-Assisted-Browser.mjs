import {chromium,expect} from '@playwright/test';
import {assertIsolatedTarget,verifyIsolatedCoordinator} from './Integration-Target.mjs';
const target=assertIsolatedTarget();await verifyIsolatedCoordinator(target);
const base=process.env.OMNICOMPILE_TEST_WEB_BASE;if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base??''))throw new Error('Isolated browser origin required');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
const admin=await browser.newContext({baseURL:base}),user=await browser.newContext({baseURL:base}),worker=await browser.newContext({baseURL:base});
async function json(context,path,body){const response=await(body?context.request.post(path,{data:body,headers:{origin:base}}):context.request.get(path));expect(response.ok(),`${path}: ${response.status()} ${await response.text()}`).toBe(true);return response.json();}
try{
 await json(admin,'/api/auth/login',{identifier:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD});
 const email=`real-browser-${target.instance}@example.test`,password='AssistedBrowserOnly!42';await json(user,'/api/auth/signup',{name:'Real browser assistance',email,password,confirmPassword:password});await json(user,'/api/auth/login',{identifier:email,password});
 const network=await json(admin,'/api/admin/networks',{name:'Real browser tool assistance',maxNodes:1,requireAdminApproval:false});
 const page=await worker.newPage(),errors=[],calls=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(new URL(request.url()).pathname==='/api/worker/compiler')calls.push(request.url());});
 await page.goto(new URL(network.joinUrl).pathname);await page.getByRole('link',{name:/Continue as Web Worker/}).click();await page.getByRole('button',{name:'Become a Worker'}).click();await expect(page.getByLabel('Worker status')).toHaveText('AVAILABLE',{timeout:30000});
 const scope=await json(worker,'/api/worker/me');
 for(const item of [
  {language:'c',sourceName:'invoice.c',source:'#include <stdio.h>\nint main(void){printf("42\\n");return 0;}'},
  {language:'python',sourceName:'invoice.py',source:'print(20+22)'},
  {language:'java',sourceName:'Invoice.java',source:'public class Invoice {public static void main(String[] a){System.out.println(20+22);}}'}
 ]){
  const submission=await json(user,'/api/compilations',item);let job;
  await expect.poll(async()=>{job=await json(user,`/api/compilations/${submission.id}`);return job.status;},{timeout:120000,intervals:[500]}).toBe('COMPLETED');
  expect(job.metrics.compilationAssistance).toMatchObject({method:'server-assisted compilation',workerNodeId:scope.nodeId});expect(job.metrics.report.programExecution).toMatchObject({status:'SUCCEEDED',output:'42\n'});expect(job.workerPlatforms).toEqual(['Web']);
  const metrics=await json(user,`/api/user/compiler-metrics?jobId=${job.id}`);expect(metrics.jobResult.successRate).toBe(100);expect(metrics.availability.registered).toBe(1);expect(metrics.availability.platforms.find(row=>row.platform==='WEB').registered).toBe(1);
 }
 expect(calls).toHaveLength(3);expect(errors).toEqual([]);
 const nodes=await json(admin,'/api/admin/nodes?page=1&pageSize=10'),node=nodes.items.find(item=>item.id===scope.nodeId);expect(node.profile.runtimes).toEqual({c:false,python:false,java:false});expect(node.profile.operations.nativeCompilation).toBe(false);
 console.log('Actual Edge browser: C/Python/Java requested through leased compiler tools, executed successfully, with one Web worker and no invented native capability.');
}finally{await browser.close();}
