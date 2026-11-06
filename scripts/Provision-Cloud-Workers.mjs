import dotenv from 'dotenv';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

dotenv.config({quiet:true});
const base=new URL(process.env.OMNICOMPILE_PROVISION_API??'http://127.0.0.1:4100');
if(!['127.0.0.1','localhost','[::1]'].includes(base.hostname))throw new Error('Local worker provisioning requires a loopback coordinator.');
const directory=resolve('.runtime/cloud-workers');
await mkdir(directory,{recursive:true});
let metadata;
try{metadata=JSON.parse(await readFile(resolve(directory,'enrollment.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const password=process.env.OMNICOMPILE_PROVISION_ADMIN_PASSWORD??process.env.ADMIN_PASSWORD;
if(!password)throw new Error('Administrator login is required for local worker provisioning. Set OMNICOMPILE_PROVISION_ADMIN_PASSWORD for this process when using hash-only admin configuration.');
let cookie='';
const origin=process.env.PUBLIC_BASE_URL??'http://localhost:5173';
async function api(path,body){
  const response=await fetch(new URL(path,base),{method:body?'POST':'GET',headers:{origin,...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`Local worker provisioning request failed (${response.status}) for ${path.split('/').slice(0,3).join('/')}.`);
  if(path==='/api/auth/login')cookie=response.headers.get('set-cookie')?.split(';')[0]??'';
  return response.status===204?null:response.json();
}
try{
  await api('/api/auth/login',{identifier:process.env.ADMIN_USERNAME??'admin',password});
  if(!cookie)throw new Error('Administrator session was not created.');
  if(!metadata){
    const network=await api('/api/admin/networks',{name:'OmniCompile Docker compiler network',description:'Administrator-enrolled language compiler containers.',maxNodes:100,requireAdminApproval:true});
    metadata={networkId:network.id,joinUrl:network.joinUrl,enrollments:{},devices:{}};
    await save();
  }
  // Persist each admission immediately so a retry never silently replaces an identity.
  for(const language of ['c','python','java']){
    const credentialFile=resolve(directory,`${language}.credential`);
    if(!metadata.enrollments[language]){
      metadata.devices[language]??=`omnicompile-cloud-${language}-${randomUUID()}`;
      await save();
      const token=new URL(metadata.joinUrl).pathname.split('/').pop();
      const enrollment=await api(`/api/join/${encodeURIComponent(token)}/accept`,{consent:true,workerType:'NATIVE',deviceIdentity:metadata.devices[language]});
      if(!enrollment.workerCredential)throw new Error('Worker enrollment returned no scoped credential.');
      await writeFile(credentialFile,enrollment.workerCredential,{mode:0o600});
      metadata.enrollments[language]=enrollment.enrollmentId;
      await save();
    }else if(!(await readFile(credentialFile,'utf8')).trim())throw new Error(`Missing saved ${language} credential. Restore the enrollment files or explicitly revoke and provision a replacement.`);
    let enrollment;
    for(let page=1;page<=10;page++){
      const result=await api(`/api/admin/networks/${metadata.networkId}/enrollments?page=${page}&pageSize=10`);
      enrollment=result.items.find(item=>item.enrollmentId===metadata.enrollments[language]);
      if(enrollment||page>=result.totalPages)break;
    }
    if(!enrollment||!['ACTIVE','PENDING'].includes(enrollment.status))throw new Error(`The saved ${language} enrollment is unavailable. Revoke and replace it explicitly.`);
    if(enrollment.approvalStatus==='PENDING')await api(`/api/admin/enrollments/${enrollment.enrollmentId}/approval`,{approved:true});
    else if(enrollment.approvalStatus!=='APPROVED')throw new Error(`The saved ${language} enrollment has not been approved.`);
  }
  console.log('Three scoped compiler enrollments provisioned and approved. Private enrollment files remain in ignored .runtime/cloud-workers.');
}finally{
  if(cookie)await api('/api/auth/logout',{}).catch(()=>console.error('Provisioning logout failed; the session will expire under the normal policy.'));
}
async function save(){await writeFile(resolve(directory,'enrollment.json'),JSON.stringify(metadata),{mode:0o600});}
