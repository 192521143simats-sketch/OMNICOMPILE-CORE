import dotenv from 'dotenv';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

dotenv.config({quiet:true});
const base=new URL(process.env.OMNICOMPILE_PROVISION_API??'http://127.0.0.1:4100');
if(!['127.0.0.1','localhost','[::1]'].includes(base.hostname))throw new Error('Local worker provisioning requires a loopback coordinator.');
const directory=resolve('.runtime/docker/cloud-workers');
await mkdir(directory,{recursive:true});
let metadata;
try{metadata=JSON.parse(await readFile(resolve(directory,'enrollment.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const password=process.env.OMNICOMPILE_PROVISION_ADMIN_PASSWORD??process.env.ADMIN_PASSWORD;
if(!password)throw new Error('Administrator login is required for local worker provisioning. Set OMNICOMPILE_PROVISION_ADMIN_PASSWORD for this process when using hash-only admin configuration.');
let cookie='';
const origin=process.env.PUBLIC_BASE_URL??'http://localhost:5173';
async function api(path,body){
  const response=await fetch(new URL(path,base),{method:body?'POST':'GET',headers:{origin,...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Object.assign(new Error(`Local worker provisioning request failed (${response.status}) for ${path.split('/').slice(0,3).join('/')}.`),{status:response.status});
  if(path==='/api/auth/login')cookie=response.headers.get('set-cookie')?.split(';')[0]??'';
  return response.status===204?null:response.json();
}
try{
  await api('/api/auth/login',{identifier:process.env.ADMIN_USERNAME??'admin',password});
  if(!cookie)throw new Error('Administrator session was not created.');
  if(!metadata){
    const network=await api('/api/admin/networks',{name:'OmniCompile compiler pool',description:'Managed compiler workers for C, Python, and Java.',maxNodes:100,requireAdminApproval:true});
    metadata={networkId:network.id,joinUrl:network.joinUrl,enrollments:{},devices:{}};
    await save();
  }
  if(metadata){
    let unavailable=false;
    try{
      const link=await api(`/api/admin/networks/${metadata.networkId}/join-link`);
      const info=await api('/api'+new URL(link.joinUrl).pathname);
      unavailable=info.network.status!=='ACTIVE';
      if(!unavailable){metadata.joinUrl=link.joinUrl;await save();}
    }catch(error){if(error.status===404)unavailable=true;else throw error;}
    if(unavailable){
      if(process.env.OMNICOMPILE_REPAIR_MANAGED_WORKERS!=='1')throw new Error('The saved managed network is unavailable. Explicitly run START-OMNICOMPILE.bat -RepairManagedWorkers to create a replacement managed pool. Existing networks are preserved.');
      const network=await api('/api/admin/networks',{name:'OmniCompile compiler pool',description:'Managed compiler workers for C, Python, and Java.',maxNodes:100,requireAdminApproval:true});
      metadata={networkId:network.id,joinUrl:network.joinUrl,enrollments:{},devices:{},replacedNetworks:[...(metadata.replacedNetworks??[]),{networkId:metadata.networkId,enrollments:metadata.enrollments,replacedAt:new Date().toISOString()}]};
      await save();
    }
  }
  async function findEnrollment(id) {
    if(!id)return null;
    for(let page=1;;page++){
      const result=await api(`/api/admin/networks/${metadata.networkId}/enrollments?page=${page}&pageSize=10`);
      const item=result.items.find(item=>item.enrollmentId===id);
      if(item)return item;
      if(page>=result.totalPages)return null;
    }
  }
  // A normal startup must never undo an administrator's revocation. Repair is
  // an explicit operator action, and always issues a new identity.
  for(const language of ['c','python','java']){
    const credentialFile=resolve(directory,`${language}.credential`);
    let enrollment=await findEnrollment(metadata.enrollments[language]);
    if(metadata.enrollments[language]&&(!enrollment||!['ACTIVE','PENDING'].includes(enrollment.status)||enrollment.approvalStatus==='REJECTED')){
      if(process.env.OMNICOMPILE_REPAIR_MANAGED_WORKERS!=='1')throw new Error(`The saved ${language} enrollment is unavailable. Explicitly run START-OMNICOMPILE.bat -RepairManagedWorkers to issue replacement managed identities; revoked records are preserved.`);
      metadata.replacedEnrollments??=[];
      metadata.replacedEnrollments.push({language,enrollmentId:metadata.enrollments[language],replacedAt:new Date().toISOString()});
      delete metadata.enrollments[language];delete metadata.devices[language];
      await save();
    }
    if(!metadata.enrollments[language]){
      const link=await api(`/api/admin/networks/${metadata.networkId}/join-link`);
      if(!link.enabled)throw new Error('Managed network admission is closed. Explicitly reopen it in the administrator dashboard before provisioning.');
      metadata.joinUrl=link.joinUrl;
      metadata.devices[language]??=`omnicompile-cloud-${language}-${randomUUID()}`;
      await save();
      const token=new URL(metadata.joinUrl).pathname.split('/').pop();
      const admitted=await api(`/api/join/${encodeURIComponent(token)}/accept`,{consent:true,workerType:'NATIVE',deviceIdentity:metadata.devices[language]});
      if(!admitted.workerCredential)throw new Error('Worker enrollment returned no private credential.');
      await writeFile(credentialFile,admitted.workerCredential,{mode:0o600});
      metadata.enrollments[language]=admitted.enrollmentId;
      await save();
      enrollment=await findEnrollment(admitted.enrollmentId);
    }else if(!(await readFile(credentialFile,'utf8')).trim())throw new Error(`Missing saved ${language} credential. Restore the enrollment files or explicitly revoke and provision a replacement.`);
    if(!enrollment||!['ACTIVE','PENDING'].includes(enrollment.status))throw new Error(`The saved ${language} enrollment is unavailable.`);
    if(enrollment.approvalStatus==='PENDING')await api(`/api/admin/enrollments/${enrollment.enrollmentId}/approval`,{approved:true,executionLocation:'CLOUD'});
    else if(enrollment.approvalStatus!=='APPROVED')throw new Error(`The saved ${language} enrollment has not been approved.`);
  }
  console.log('Three private compiler enrollments provisioned and approved. Private enrollment files remain in ignored .runtime/docker/cloud-workers.');
}catch(error){
  console.error(error instanceof Error?error.message:'Managed worker provisioning failed.');
  process.exitCode=1;
}finally{
  if(cookie)await api('/api/auth/logout',{}).catch(()=>console.error('Provisioning logout failed; the session will expire under the normal policy.'));
}
async function save(){await writeFile(resolve(directory,'enrollment.json'),JSON.stringify(metadata),{mode:0o600});}
