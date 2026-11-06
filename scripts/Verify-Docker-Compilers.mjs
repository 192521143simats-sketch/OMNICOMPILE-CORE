import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({quiet:true});
const exec=promisify(execFile);
const instance=randomBytes(8).toString('hex');
const schema=`omnicompile_test_${instance}`;
const coordinator=`omnicompile-test-coordinator-${instance}`;
const owned=[];
const origin='http://localhost:5173';
const adminPassword=`Admin!${randomBytes(24).toString('hex')}`;
const password=`User!${randomBytes(20).toString('hex')}`;
let temporary,connection,databaseCreated=false,base,primaryFailure;

async function docker(args,env={}){
  try{return (await exec('docker',args,{env:{...process.env,...env},windowsHide:true,timeout:180_000,maxBuffer:3_000_000})).stdout.trim();}
  catch(error){throw new Error(`Docker ${args[0]} operation failed: ${String(error.stderr??error.message).slice(-1500)}`);}
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(work,label,timeout=120_000){
  const end=Date.now()+timeout;let last;
  do{try{return await work();}catch(error){last=error;}await pause(500);}while(Date.now()<end);
  throw new Error(`${label} timed out: ${last?.message}`);
}
class Client{
  cookie='';
  async request(path,body){
    const response=await fetch(base+path,{method:body?'POST':'GET',headers:{origin,...(this.cookie?{cookie:this.cookie}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20_000)});
    const cookie=response.headers.get('set-cookie');if(cookie)this.cookie=cookie.split(';')[0];
    const value=(response.headers.get('content-type')??'').includes('json')?await response.json():Buffer.from(await response.arrayBuffer());
    return {status:response.status,value};
  }
  async api(path,body,status=body?200:200){const result=await this.request(path,body);assert.equal(result.status,status,`${path}: ${JSON.stringify(result.value)}`);return result.value;}
}

try{
  for(const name of ['omnicompile-mysql','omnicompile-coordinator','omnicompile-frontend','omnicompile-c-worker','omnicompile-python-worker','omnicompile-java-worker']){
    await wait(async()=>assert.equal(await docker(['inspect','--format','{{.State.Health.Status}}',name]),'healthy'),`${name} health`);
  }
  connection=await mysql.createConnection({host:'127.0.0.1',port:3307,user:'root',password:process.env.MYSQL_ROOT_PASSWORD});
  await connection.query(`CREATE DATABASE \`${schema}\``);databaseCreated=true;
  temporary=await mkdtemp(join(tmpdir(),'omnicompile-docker-compiler-'));
  const secret=resolve('.runtime/compiler-service.token');
  const environment={DB_PASSWORD:process.env.MYSQL_ROOT_PASSWORD,ADMIN_PASSWORD:adminPassword};
  await docker(['create','--name',coordinator,'--label',`omnicompile.test.instance=${instance}`,'--network','omnicompile-network','--init','--read-only','--tmpfs','/tmp:rw,nosuid,size=512m,mode=1777','--cap-drop','ALL','--security-opt','no-new-privileges:true','--publish','127.0.0.1::4100','--mount',`type=bind,source=${secret},target=/run/secrets/compiler-token,readonly`,'--env','DB_PASSWORD','--env','ADMIN_PASSWORD','--env','ADMIN_USERNAME=admin','--env','DB_HOST=omnicompile-mysql','--env','DB_PORT=3306','--env','DB_USER=root','--env',`DB_NAME=${schema}`,'--env','NODE_ENV=development','--env','HOST=0.0.0.0','--env','PORT=4100','--env',`PUBLIC_BASE_URL=${origin}`,'--env','COORDINATOR_PUBLIC_URL=http://localhost:4100','--env','OMNICOMPILE_REQUIRE_ADMIN_APPROVAL=true','--env','OMNICOMPILE_EXECUTION_MODE=disabled','--env','OMNICOMPILE_COMPILER_TOKEN_FILE=/run/secrets/compiler-token','--env','OMNICOMPILE_C_COMPILER_URL=http://omnicompile-c-worker:4101','--env','OMNICOMPILE_PYTHON_COMPILER_URL=http://omnicompile-python-worker:4101','--env','OMNICOMPILE_JAVA_COMPILER_URL=http://omnicompile-java-worker:4101','omnicompile-coordinator:local'],environment);
  owned.push(coordinator);
  await docker(['start',coordinator]);
  const published=await docker(['port',coordinator,'4100/tcp']);
  base=`http://127.0.0.1:${published.split(':').pop()}`;
  await wait(async()=>assert.equal((await fetch(base+'/ready',{signal:AbortSignal.timeout(3000)})).status,200),'isolated coordinator');
  assert.equal(await docker(['exec',coordinator,'sh','-c','for tool in gcc g++ python python3 javac java; do if command -v "$tool" >/dev/null; then exit 1; fi; done; echo toolchains-absent']),'toolchains-absent');
  const admin=new Client();await admin.api('/api/auth/login',{identifier:'admin',password:adminPassword});
  const network=await admin.api('/api/admin/networks',{name:`Docker compiler verification ${instance}`,maxNodes:6,requireAdminApproval:true},201);
  const joinPath=new URL(network.joinUrl).pathname;
  const languages=['c','python','java'];
  const workerNodes={};
  const workerSecrets=[];
  for(const language of languages){
    const enrollment=await new Client().api(`/api${joinPath}/accept`,{consent:true,workerType:'NATIVE',deviceIdentity:`docker-compiler-${language}-${instance}`},201);
    await admin.api(`/api/admin/enrollments/${enrollment.enrollmentId}/approval`,{approved:true});
    const credential=join(temporary,`${language}.credential`);await writeFile(credential,enrollment.workerCredential,{mode:0o600});
    workerSecrets.push(enrollment.workerCredential);
    const name=`omnicompile-test-${language}-${instance}`;
    await docker(['create','--name',name,'--label',`omnicompile.test.instance=${instance}`,'--network','omnicompile-network','--init','--read-only','--tmpfs','/tmp:rw,nosuid,size=512m,mode=1777','--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','768m','--pids-limit','128','--mount',`type=bind,source=${credential},target=/run/secrets/worker,readonly`,'--env',`COORDINATOR_URL=http://${coordinator}:4100`,'--env',`OMNICOMPILE_WORKER_LANGUAGE=${language}`,'--env','WORKER_CREDENTIAL_FILE=/run/secrets/worker',`omnicompile-${language}-worker:local`,'node','--import','tsx','apps/worker/src/cloud.ts']);
    owned.push(name);await docker(['start',name]);
    workerNodes[language]=await wait(async()=>{
      const [rows]=await connection.execute(`SELECT id,profile_json FROM \`${schema}\`.nodes WHERE enrollment_id=? AND status='AVAILABLE'`,[enrollment.enrollmentId]);
      assert.equal(rows.length,1);const profile=typeof rows[0].profile_json==='string'?JSON.parse(rows[0].profile_json):rows[0].profile_json;
      for(const candidate of languages)assert.equal(profile.runtimes[candidate],candidate===language);
      return {nodeId:rows[0].id,toolchain:profile.toolchains[language]};
    },`${language} scoped node registration`);
  }
  const user=new Client(),other=new Client();
  for(const [index,client] of [user,other].entries()){
    const email=`compiler-${index}-${instance}@example.test`;
    await client.api('/api/auth/signup',{name:'Docker Compiler Verification',email,password,confirmPassword:password},201);
    await client.api('/api/auth/login',{identifier:email,password});
  }
  const cases=[
    {language:'c',name:'Ledger.c',source:'#include <stdio.h>\nstruct Item {int amount;}; int main(void){struct Item x={42}; printf("%d\\n",x.amount);return 0;}',type:'EXECUTABLE'},
    {language:'c',name:'loop.c',source:'int main(){int total=0;for(int i=0;i<4;i=i+1){total=total+i;}return total;}',type:'EXECUTABLE'},
    {language:'python',name:'ledger.py',source:'def total(values):\n    return sum(values)\nprint(total([20,22]))\n',type:'GENERATED_SOURCE'},
    {language:'java',name:'Ledger.java',source:'public class Ledger { public static void main(String[] args){ System.out.println(42); } }',type:'JAR'},
    {language:'c',name:'broken.c',source:'#include <stdio.h>\nint main(void){printf("%d",missing_value);return 0;}',failed:true},
    {language:'python',name:'broken.py',source:'def calculate(:\n    return 1\n',failed:true},
    {language:'java',name:'Broken.java',source:'public class Broken { public static void main(String[] args){ System.out.println(missingValue); } }',failed:true},
    {language:'c',name:'secret.c',source:'#include "/run/secrets/worker"\nint main(void){return 0;}',failed:true,denied:true},
    {language:'c',name:'parent.c',source:'#include "/proc/1/environ"\nint main(void){return 0;}',failed:true,denied:true}
  ];
  const outcomes=[];
  for(const item of cases){
    const submitted=await user.api('/api/compilations',{language:item.language,sourceName:item.name,source:item.source},202);
    const job=await wait(async()=>{const value=await user.api(`/api/compilations/${submitted.id}`);assert.ok(['COMPLETED','FAILED'].includes(value.status));return value;},`${item.name} terminal compilation`,180_000);
    assert.equal(job.status,item.failed?'FAILED':'COMPLETED',`${item.name}: ${job.error}`);
    if(item.denied){
      assert.match(job.error,/permission denied|operation not permitted/i,`${item.name}: protected read was not denied by the filesystem sandbox`);
      for(const secretValue of workerSecrets)assert.ok(!JSON.stringify(job).includes(secretValue));
    }
    if(item.failed)assert.ok(!job.artifacts.some(artifact=>['EXECUTABLE','JAR','BYTECODE'].includes(artifact.artifactType)));
    else{
      const artifact=job.artifacts.find(value=>value.artifactType===item.type);assert.ok(artifact,`${item.name}: final artifact missing`);
      const download=await user.request(artifact.downloadUrl);assert.equal(download.status,200);assert.ok(download.value.length>0);
      if(item.type==='EXECUTABLE')assert.equal(download.value.subarray(0,4).toString(),'\u007fELF');
      if(item.type==='JAR')assert.equal(download.value.subarray(0,2).toString(),'PK');
      assert.equal((await other.request(artifact.downloadUrl)).status,404);
      const reportArtifact=job.artifacts.find(value=>value.artifactType==='BUILD_REPORT_JSON');assert.ok(reportArtifact);
      const report=await user.api(reportArtifact.downloadUrl);assert.equal(report.compilationSummary.sourceFile,item.name);assert.equal(report.finalResult.status,'SUCCESS');
      const [rows]=await connection.execute(`SELECT t.kind,t.assigned_node_id,t.status,r.task_id FROM \`${schema}\`.tasks t JOIN \`${schema}\`.results r ON r.task_id=t.id WHERE t.job_id=? OR t.id IN (SELECT bt.task_id FROM \`${schema}\`.optimization_batch_tasks bt JOIN \`${schema}\`.compilation_jobs j ON j.batch_id=bt.batch_id WHERE j.id=?)`,[job.id,job.id]);
      assert.ok(rows.length>0,`${item.name}: no accepted distributed results`);
      if(item.name!=='loop.c')for(const row of rows){assert.equal(row.assigned_node_id,workerNodes[item.language].nodeId);assert.equal(row.status,'COMPLETED');}
    }
    outcomes.push({source:item.name,language:item.language,status:job.status,artifacts:job.artifacts.map(value=>value.artifactType)});
  }
  const concurrentJobs=await Promise.all(cases.slice(0,2).map(item=>user.api('/api/compilations',{language:item.language,sourceName:item.name,source:item.source},202)));
  await Promise.all(concurrentJobs.map(async submitted=>{
    const job=await wait(async()=>{const value=await user.api(`/api/compilations/${submitted.id}`);assert.ok(['COMPLETED','FAILED'].includes(value.status));return value;},'concurrent C compilation',180_000);
    assert.equal(job.status,'COMPLETED',job.error);
  }));
  const [verified]=await connection.query(`SELECT outcome,COUNT(*) count FROM \`${schema}\`.result_verifications GROUP BY outcome`);
  assert.ok(verified.some(row=>row.outcome==='VERIFIED'&&Number(row.count)>0));
  const serviceProbe=String.raw`const fs=require('node:fs');const token=fs.readFileSync('/run/secrets/compiler-token','utf8').trim();const source='#include "/run/secrets/compiler-token"\nint main(void){return 0;}';fetch('http://omnicompile-c-worker:4101/compile',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({action:'verify',source:{language:'c',sourceName:'probe.c',sourceText:source},worker:{operation:'c_compile',generatedSource:source}})}).then(async response=>{const body=await response.text();if(response.status!==422||!/permission denied|operation not permitted/i.test(body)||body.includes(token))process.exit(1);console.log('compiler-service-secret-read-denied');}).catch(()=>process.exit(1));`;
  assert.equal(await docker(['exec',coordinator,'node','-e',serviceProbe]),'compiler-service-secret-read-denied');
  const privateToken=(await readFile(secret,'utf8')).trim();
  assert.ok(!JSON.stringify(outcomes).includes(privateToken));
  console.log(JSON.stringify({instance,coordinatorHasNativeToolchains:false,workerNodes,outcomes,concurrentJobsVerified:concurrentJobs.length,verificationOutcomes:verified,compilerServiceSecretReadDenied:true,developerDataModified:false,executionPerformed:false},null,2));
}catch(error){primaryFailure=error;throw error;}finally{
  const failures=[];
  for(const name of owned.reverse()){
    try{const label=await docker(['inspect','--format','{{index .Config.Labels "omnicompile.test.instance"}}',name]);assert.equal(label,instance);await docker(['rm','--force',name]);}catch(error){failures.push(error.message);}
  }
  try{
    if(databaseCreated&&/^omnicompile_test_[a-f0-9]{16}$/.test(schema)){
      // Cleanup must survive a fixture database restart or a closed test connection.
      const cleanup=await mysql.createConnection({host:'127.0.0.1',port:3307,user:'root',password:process.env.MYSQL_ROOT_PASSWORD});
      try{await cleanup.query(`DROP DATABASE \`${schema}\``);}finally{await cleanup.end();}
    }
  }catch(error){failures.push(error.message);}
  connection?.destroy();
  try{if(temporary)await rm(temporary,{recursive:true,force:true});}catch(error){failures.push(error.message);}
  if(failures.length){
    const message=`Owned fixture cleanup failed: ${failures.join('; ')}`;
    if(primaryFailure)console.error(message);else throw new Error(message);
  }
}
