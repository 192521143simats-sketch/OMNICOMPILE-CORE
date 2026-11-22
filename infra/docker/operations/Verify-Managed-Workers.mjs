import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const base=new URL(process.env.OMNICOMPILE_PROVISION_API??'http://127.0.0.1:4100');
if(!['127.0.0.1','localhost','[::1]'].includes(base.hostname))throw new Error('Managed-worker readiness requires a loopback coordinator.');
const directory=resolve('.runtime/docker/cloud-workers');
const metadata=JSON.parse(await readFile(resolve(directory,'enrollment.json'),'utf8'));
const workers=await Promise.all(['c','python','java'].map(async language=>({language,credential:(await readFile(resolve(directory,`${language}.credential`),'utf8')).trim()})));
const deadline=Date.now()+60000;
let unavailable=[];
do{
 const checks=await Promise.all(workers.map(async worker=>{
  try{
   const response=await fetch(new URL('/api/enrollments/status',base),{headers:{authorization:`Bearer ${worker.credential}`},redirect:'error',signal:AbortSignal.timeout(5000)});
   if(!response.ok)return false;
   const scope=await response.json();
   return scope.enrollmentId===metadata.enrollments[worker.language]&&scope.networkId===metadata.networkId&&scope.approvalStatus==='APPROVED'&&scope.nodeId&&['ONLINE','AVAILABLE','BUSY'].includes(scope.nodeStatus);
  }catch{return false;}
 }));
 unavailable=workers.filter((_,index)=>!checks[index]).map(worker=>worker.language);
 if(!unavailable.length){console.log('Managed C, Python and Java workers are registered and online.');process.exit(0);}
 await new Promise(resolve=>setTimeout(resolve,1000));
}while(Date.now()<deadline);
throw new Error(`Managed workers did not register within 60 seconds: ${unavailable.join(', ')}. Inspect their container state; existing credentials and data were preserved.`);
