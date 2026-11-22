import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';

for(const disabled of [false,true])test(`managed worker repair preserves old records and requires explicit action (disabled network: ${disabled})`,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'omnicompile-managed-'));
 const records=['c','python','java'].map(language=>({enrollmentId:`old-${language}`,status:'REVOKED',approvalStatus:'APPROVED'}));
 let admissions=0,networkReplacements=0;
 const server=createServer(async(req,res)=>{
  const body=[];for await(const chunk of req)body.push(chunk);const value=body.length?JSON.parse(Buffer.concat(body)):null;
  res.setHeader('Content-Type','application/json');
  if(req.url==='/api/auth/login'){res.setHeader('Set-Cookie','fixture=admin');res.end('{}');}
  else if(req.url==='/api/auth/logout'){res.statusCode=204;res.end();}
  else if(req.url==='/api/admin/networks'){networkReplacements++;res.statusCode=201;res.end(JSON.stringify({id:'replacement-network',joinUrl:'https://fixture.example/join/master-fixture-token'}));}
  else if(req.url==='/api/join/master-fixture-token')res.end(JSON.stringify({network:{status:disabled&&!networkReplacements?'DISABLED':'ACTIVE'}}));
  else if(req.url.includes('/enrollments?page='))res.end(JSON.stringify({items:records,totalPages:1}));
  else if(req.url.endsWith('/join-link'))res.end(JSON.stringify({enabled:true,joinUrl:'https://fixture.example/join/master-fixture-token'}));
  else if(req.url.endsWith('/accept')){admissions++;const enrollmentId=`replacement-${admissions}`;records.push({enrollmentId,status:'PENDING',approvalStatus:'PENDING'});res.statusCode=201;res.end(JSON.stringify({enrollmentId,workerCredential:`private-fixture-${admissions}`}));}
  else if(req.url.endsWith('/approval')){assert.equal(value.executionLocation,'CLOUD');const id=req.url.split('/')[4];const record=records.find(row=>row.enrollmentId===id);record.approvalStatus='APPROVED';res.end('{}');}
  else{res.statusCode=404;res.end('{}');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=`http://127.0.0.1:${server.address().port}`;
 const script=resolve('infra/docker/operations/Provision-Cloud-Workers.mjs');
 const saved=join(directory,'.runtime/docker/cloud-workers');await mkdir(saved,{recursive:true});
 await writeFile(join(saved,'enrollment.json'),JSON.stringify({networkId:'managed-network',joinUrl:'https://fixture.example/join/master-fixture-token',devices:{},enrollments:{c:'old-c',python:'old-python',java:'old-java'}}));
 for(const language of ['c','python','java'])await writeFile(join(saved,`${language}.credential`),'revoked-fixture');
 const run=repair=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[script],{cwd:directory,windowsHide:true,env:{...process.env,OMNICOMPILE_PROVISION_API:address,OMNICOMPILE_PROVISION_ADMIN_PASSWORD:'fixture-password',ADMIN_USERNAME:'fixture-admin',PUBLIC_BASE_URL:address,OMNICOMPILE_REPAIR_MANAGED_WORKERS:repair?'1':''},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);child.on('error',reject);child.on('close',code=>resolve({code,output}));
 });
 try{
  const blocked=await run(false);assert.notEqual(blocked.code,0);assert.match(blocked.output,/Explicitly run/);assert.equal(admissions,0);
  const repaired=await run(true);assert.equal(repaired.code,0,repaired.output);assert.equal(admissions,3);
  assert.ok(records.slice(0,3).every(row=>row.status==='REVOKED'));
  const metadata=JSON.parse(await readFile(join(saved,'enrollment.json'),'utf8'));if(disabled){assert.equal(metadata.replacedNetworks.length,1);assert.equal(networkReplacements,1);assert.deepEqual(metadata.replacedNetworks[0].enrollments,{c:'old-c',python:'old-python',java:'old-java'});}else{assert.equal(networkReplacements,0);assert.equal(metadata.replacedEnrollments.length,3);}
  const repeat=await run(false);assert.equal(repeat.code,0,repeat.output);assert.equal(admissions,3);
  assert.deepEqual(JSON.parse(await readFile(join(saved,'enrollment.json'),'utf8')).enrollments,metadata.enrollments);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
});
