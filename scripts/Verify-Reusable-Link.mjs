import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import {NetworkService} from '../apps/coordinator/src/networks.ts';
import {assertIsolatedTarget,verifyIsolatedCoordinator} from './Integration-Target.mjs';
const target=assertIsolatedTarget();await verifyIsolatedCoordinator(target);
const origin=process.env.PUBLIC_BASE_URL;
async function request(path,body,cookie){const response=await fetch(target.base+path,{method:body?'POST':'GET',headers:{origin,...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{status:response.status,value:response.status===204?null:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
const login=await request('/api/auth/login',{identifier:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD});assert.equal(login.status,200);
const pool=mysql.createPool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),database:target.database,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
try{
const created=await request('/api/admin/networks',{name:'Reusable network fixture',maxNodes:3},login.cookie);assert.equal(created.status,201);
assert.match(new URL(created.value.joinUrl).pathname,/^\/join-network-a\//);
const token=new URL(created.value.joinUrl).pathname.split('/').at(-1);
assert.equal((await request(`/api/join-network-b/${token}`)).status,404,'Mismatched network labels must be rejected');
assert.equal((await request(`/api/join/${token}`)).status,200,'Previously shared token-only links remain usable');
assert.equal((await request(`/api/admin/networks/${created.value.id}/policy`,undefined,login.cookie)).status,404);
const policyResponse=await fetch(target.base+`/api/admin/networks/${created.value.id}/policy`,{method:'PATCH',headers:{origin,cookie:login.cookie,'content-type':'application/json'},body:JSON.stringify({allowedWorkerTypes:['ANDROID']})});assert.equal(policyResponse.status,404);
await pool.execute("UPDATE distributed_networks SET configuration_json=JSON_SET(configuration_json,'$.policy',CAST(? AS JSON)) WHERE id=?",[JSON.stringify({allowedWorkerTypes:['ANDROID']}),created.value.id]);
const {retireNetworkSchedulingPolicyMigration}=await import('../apps/coordinator/src/migrations/0025-retire-network-scheduling-policy.mjs');await retireNetworkSchedulingPolicyMigration().run(pool);
const [[configuration]]=await pool.execute('SELECT configuration_json configuration FROM distributed_networks WHERE id=?',[created.value.id]);const config=typeof configuration.configuration==='string'?JSON.parse(configuration.configuration):configuration.configuration;
assert.equal('policy' in config,false);assert.equal(config.requireAdminApproval,false,'Removing scheduling configuration must preserve admission settings');
const linkPath=`/api${new URL(created.value.joinUrl).pathname}`,control=`/api/admin/networks/${created.value.id}/join-link`;
const initial=await request(control,undefined,login.cookie);assert.equal(initial.status,200,'Network must have a persisted default join link');assert.equal(initial.value.enabled,true);assert.equal(initial.value.joinUrl,created.value.joinUrl);
const body={consent:true,workerType:'BROWSER',deviceIdentity:'reusable-device-one'};
assert.equal((await request(linkPath)).value.network.accepting,true);
assert.equal((await request(linkPath+'/accept',{...body,consent:false})).status,400);
const devices=await Promise.all([request(linkPath+'/accept',body),request(linkPath+'/accept',{...body,deviceIdentity:'reusable-device-two'})]);
assert.deepEqual(devices.map(x=>x.status),[201,201],'Same link must admit multiple explicitly consenting devices');
assert.notEqual(devices[0].value.enrollmentId,devices[1].value.enrollmentId);
assert.notEqual(devices[0].cookie,devices[1].cookie);
const service=new NetworkService(pool),credentials=devices.map(device=>device.cookie.slice(device.cookie.indexOf('=')+1));
const profile={workerType:'BROWSER',deviceType:'DESKTOP',cpuModel:'Reusable registration fixture',logicalCores:1,totalMemoryBytes:0,operatingSystem:'Test',architecture:'browser',runtimes:{c:false,python:false,java:false},toolchains:{c:{available:false},python:{available:false},java:{available:false}},operations:{irOptimization:true,staticAnalysis:true,browserCompute:true,nativeCompilation:false}};
const nodes=await Promise.all(credentials.map(credential=>service.register(credential,profile)));assert.ok(nodes[0]);assert.ok(nodes[1]);assert.notEqual(nodes[0].nodeId,nodes[1].nodeId,'Same default link must yield independently registered nodes');
assert.equal((await request(control)).status,401,'Only admin may retrieve the persisted default link');
assert.equal((await request(`/api/admin/networks/${created.value.id}/invitations`,{},login.cookie)).status,404,'Retired scoped invitation API must not issue another link');
assert.equal((await request(control,{enabled:false})).status,401,'Only admin may change admission');
assert.equal((await request(control,{enabled:false},login.cookie)).status,200);
const blocked=await request(linkPath);assert.equal(blocked.value.network.accepting,false);assert.equal(blocked.value.network.joinLinkStatus,'REVOKED');
assert.equal((await request(linkPath+'/accept',{...body,deviceIdentity:'revoked-link-device'})).status,410);
assert.ok(await service.authenticateCredential(credentials[1]),'Closing admission must not revoke registered nodes');
// Leaving remains authenticated after admission closes: revoking the public link
// must not invalidate an already enrolled device's private credential.
assert.equal((await request('/api/worker/leave',{},devices[0].cookie)).status,204,'Link revocation must preserve existing worker enrollment');
assert.equal((await request(control,{enabled:true},login.cookie)).value.joinUrl,created.value.joinUrl,'Invoke must restore the same link');
const final=await Promise.all(['final-slot-one','final-slot-two','final-slot-three'].map(deviceIdentity=>request(linkPath+'/accept',{...body,deviceIdentity})));
assert.deepEqual(final.map(x=>x.status).sort(),[201,201,409],'Concurrent reusable admission cannot exceed capacity');
assert.equal((await request(linkPath+'/accept',{...body,deviceIdentity:'over-capacity-device'})).status,409,'Reusable admission cannot exceed capacity');
assert.equal((await request(control,undefined,login.cookie)).value.joinUrl,created.value.joinUrl,'Link must survive subsequent server reads');
await request(`/api/admin/networks/${created.value.id}/disable`,{},login.cookie);
assert.equal((await request(linkPath)).value.network.accepting,false);
assert.equal((await request(control,{enabled:true},login.cookie)).status,409,'Disabled network cannot reopen admission');
console.log(JSON.stringify({reusableConsent:true,defaultEnabled:true,stableLink:true,adminToggle:true,revokedLinkRejected:true,existingWorkersPreserved:true,atomicCapacity:true,disabledNetworkRejected:true}));
}finally{await pool.end();}
