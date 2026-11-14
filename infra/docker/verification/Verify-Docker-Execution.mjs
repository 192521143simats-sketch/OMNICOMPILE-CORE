// Real, serial acceptance of the private Docker execution broker. No SQL writes.
// Run only after the revised project services are healthy and while no other job is running.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

function docker(args,input,timeout=90_000){
  return new Promise((resolve,reject)=>{
    const child=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
    const chunks=[];let size=0,errors='';
    const timer=setTimeout(()=>{child.kill();reject(new Error('Docker execution acceptance timed out.'));},timeout);
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>1_000_000){child.kill();reject(new Error('Acceptance output exceeded its bound.'));}else chunks.push(chunk);});
    child.stderr.on('data',chunk=>{if(errors.length<2000)errors+=chunk.toString();});
    child.stdin.on('error',()=>{});child.stdin.end(input);
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('close',code=>{clearTimeout(timer);code===0?resolve(Buffer.concat(chunks).toString('utf8').trim()):reject(new Error('Docker acceptance command failed: '+errors.slice(-500)));});
  });
}
const inside=String.raw`
import {requestDockerJob} from '@omnicompile/orchestration';
const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);
const request=JSON.parse(Buffer.concat(chunks).toString('utf8'));
if(request.compileJava){
  const compiled=await requestDockerJob({kind:'task',language:'java',payload:{operation:'java_compile',sourceName:request.payload.sourceName,source:request.payload.generatedSource}});
  request.payload.artifactBase64=compiled.result.artifactBase64;
  request.payload.artifactName=compiled.result.fileName;
}
const controller=new AbortController();
const timer=request.cancel?setTimeout(()=>controller.abort(),6000):undefined;
try{console.log(JSON.stringify(await requestDockerJob({kind:'execute',language:request.payload.language,payload:request.payload},controller.signal)));}
catch(error){if(request.cancel&&controller.signal.aborted)console.log(JSON.stringify({cancelled:true}));else throw error;}
finally{clearTimeout(timer);}
`;
async function request(payload,options={}){
  const text=await docker(['exec','-i','omnicompile-coordinator','node','--import','tsx','--input-type=module','-e',inside],JSON.stringify({payload,...options}));
  return JSON.parse(text);
}
async function jobs(){return (await docker(['ps','--all','--filter','name=^/omnicompile-job-','--format','{{.Names}}'])).split('\n').filter(Boolean);}
async function until(work,label,timeout=15_000){const end=Date.now()+timeout;do{const result=await work();if(result)return result;await delay(150);}while(Date.now()<end);throw new Error(label);}
assert.deepEqual(await jobs(),[],'Run execution acceptance after all other jobs finish.');
const cases=[
  {name:'C execution',payload:{language:'c',sourceName:'invoice.c',generatedSource:'#include <stdio.h>\nint main(void){puts("42");return 0;}'},status:'SUCCEEDED',output:'42\n'},
  {name:'Python input',payload:{language:'python',sourceName:'invoice.py',generatedSource:'print(int(input())+1)',input:'41\n'},status:'SUCCEEDED',output:'42\n'},
  {name:'Java JAR execution',payload:{language:'java',sourceName:'Invoice.java',generatedSource:'public class Invoice { public static void main(String[] args){System.out.println(42);} }'},compileJava:true,status:'SUCCEEDED',output:'42\n'},
  {name:'Python runtime failure',payload:{language:'python',sourceName:'failure.py',generatedSource:'print(1/0)'},status:'FAILED',diagnostic:'ZeroDivisionError'},
  {name:'Execution timeout',payload:{language:'python',sourceName:'loop.py',generatedSource:'while True: pass'},status:'TIMED_OUT'},
  {name:'Output ceiling',payload:{language:'python',sourceName:'flood.py',generatedSource:'while True: print("x"*1024,flush=True)'},status:'OUTPUT_LIMIT'},
  {name:'Filesystem, identity and environment',payload:{language:'python',sourceName:'security.py',generatedSource:'import os\nassert os.getuid()==1000\nassert not ({"DB_PASSWORD","ADMIN_PASSWORD","WORKER_CREDENTIAL"}&set(os.environ))\nfor path in ["/run/secrets/executor-token","/proc/1/environ"]:\n try:\n  open(path,"rb").read()\n  raise AssertionError("protected read allowed")\n except OSError: pass\ntry:\n open("/etc/omnicompile-write-probe","w").write("x")\n raise AssertionError("root filesystem write allowed")\nexcept OSError: pass\nprint("isolated")'},status:'SUCCEEDED',output:'isolated\n'},
  {name:'Controller output integrity',payload:{language:'python',sourceName:'controller.py',generatedSource:'import os\ntry:\n fd=os.open("/proc/"+str(os.getppid())+"/fd/1",os.O_WRONLY)\n os.write(fd,b"FORGED")\n raise AssertionError("controller output writable")\nexcept OSError: pass\nprint("protected")'},status:'SUCCEEDED',output:'protected\n'},
  {name:'Network isolation',payload:{language:'python',sourceName:'network.py',generatedSource:'import errno,socket\ntry:\n socket.socket(socket.AF_INET,socket.SOCK_STREAM).close()\n raise AssertionError("network socket creation allowed")\nexcept OSError as error:\n assert error.errno==errno.EPERM\nprint("network denied")'},status:'SUCCEEDED',output:'network denied\n'}
];
const evidence=[];
for(const item of cases){
  const result=await request(item.payload,{compileJava:item.compileJava===true});
  assert.equal(result.execution.status,item.status,item.name+': '+result.execution.stderr);
  if(item.output!==undefined)assert.equal(result.execution.stdout,item.output,item.name);
  if(item.diagnostic)assert.ok(result.execution.stderr.includes(item.diagnostic),item.name);
  assert.ok(result.execution.durationMs>0,item.name+' measured time missing');
  assert.equal(result.execution.peakMemoryBytes,null,'Unavailable memory must not be invented');
  assert.ok(Buffer.byteLength(result.execution.stdout)+Buffer.byteLength(result.execution.stderr)<=65536);
  if(item.payload.language==='c')assert.equal(Buffer.from(result.artifact.contentBase64,'base64').subarray(0,4).toString(),'\x7fELF');
  assert.deepEqual(await jobs(),[],item.name+' left an owned container');
  evidence.push({test:item.name,status:item.status,durationMs:result.execution.durationMs});
  console.log(item.name+': PASS');
}
const cancellation=request({language:'python',sourceName:'cancel.py',generatedSource:'while True: pass'},{cancel:true}).then(value=>({value,error:null}),error=>({value:null,error}));
const running=await until(async()=>{
  for(const name of await jobs()){
    const details=JSON.parse(await docker(['inspect',name]))[0];
    if(details.State.Running)return details;
  }
},'Cancellation probe never reached a running container.');
assert.equal(running.HostConfig.NetworkMode,'none');
assert.equal(running.HostConfig.ReadonlyRootfs,true);
assert.equal(running.Config.User,'1000:1000');
assert.equal(running.HostConfig.Privileged,false);
assert.ok(running.HostConfig.Memory>0&&running.HostConfig.PidsLimit>0&&running.HostConfig.NanoCpus>0);
assert.deepEqual(running.HostConfig.CapDrop,['ALL']);
assert.ok(running.Mounts.every(mount=>mount.Type==='tmpfs'),'Job exposed a persistent volume or host mount');
const cancelled=await cancellation;
if(cancelled.error)throw cancelled.error;
assert.equal(cancelled.value.cancelled,true,'Cancellation was not observed by the scoped client');
await until(async()=>!(await jobs()).length,'Cancelled container was not removed.');
evidence.push({test:'Cancellation and live container restrictions',status:'PASS'});
console.log(JSON.stringify({checks:evidence,submittedProgramsExecuted:true,databaseModified:false,remainingJobContainers:0},null,2));
