import {chromium,_electron,expect} from '@playwright/test';
import mysql from 'mysql2/promise';
import {resolve,join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {assertIsolatedTarget,verifyIsolatedCoordinator} from './Integration-Target.mjs';
import {terminateOwnedTestProcess} from './Owned-Test-Process.mjs';
import {startAndroidParticipant} from './Android-Fixture.mjs';

const target=assertIsolatedTarget();await verifyIsolatedCoordinator(target);
const web=process.env.OMNICOMPILE_TEST_WEB_BASE,evidence=process.env.OMNICOMPILE_TEST_EVIDENCE;
if(!web||!/^http:\/\/127\.0\.0\.1:\d+$/.test(web)||!evidence)throw new Error('Owned mixed web fixture required');
const data=resolve(evidence,'mixed-windows-profile');await mkdir(data,{recursive:true});
const includeAndroid=process.env.OMNICOMPILE_MIXED_ANDROID==='1';
let cookie='',browser,desktop,desktopProcess,failure,android,androidNode,network;
const db=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),database:target.database,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
async function api(path,body,method=body?'POST':'GET'){const response=await fetch(target.base+path,{method,headers:{origin:web,...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});expect(response.ok,`${path}: ${response.status}`).toBe(true);if(path==='/api/auth/login')cookie=response.headers.get('set-cookie').split(';')[0];return response.status===204?null:response.json();}
async function completed(task){await expect.poll(async()=>(await api('/api/admin/tasks/'+task.id)).status,{timeout:90000}).toBe('COMPLETED');const[rows]=await db.execute("SELECT a.node_id,r.result_json FROM task_attempts a JOIN results r ON r.task_id=a.task_id AND r.attempt=a.attempt WHERE a.task_id=? AND a.status='COMPLETED'",[task.id]);expect(rows).toHaveLength(1);return{node:rows[0].node_id,result:typeof rows[0].result_json==='string'?JSON.parse(rows[0].result_json):rows[0].result_json};}
async function restart(){if(!process.send)throw new Error('Owned fault control required');const id=crypto.randomUUID();await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{process.off('message',receive);reject(new Error('Coordinator restart timeout'));},60000);function receive(message){if(message.id!==id)return;process.off('message',receive);clearTimeout(timer);message.error?reject(new Error(message.error)):resolve();}process.on('message',receive);process.send({id,recoveryAction:'restartCoordinator'});});}
try{
  await api('/api/auth/login',{identifier:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD});
  network=await api('/api/admin/networks',{name:'Actual mixed workers',maxNodes:4,requireAdminApproval:true});
  expect(new URL(network.joinUrl).origin).toBe(web);
  browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
  const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  async function approve(workerType){let enrollment;await expect.poll(async()=>{const result=await api(`/api/admin/networks/${network.id}/enrollments?page=1&pageSize=10`);enrollment=result.items.find(item=>item.workerType===workerType&&item.approvalStatus==='PENDING');return Boolean(enrollment);},{timeout:60000}).toBe(true);await api(`/api/admin/enrollments/${enrollment.enrollmentId}/approval`,{approved:true});}
  await page.goto(network.joinUrl);await page.getByRole('button',{name:'Become a Worker'}).click();await approve('BROWSER');
  const browserStatus=page.getByLabel('Worker status');await expect(browserStatus).toHaveText('AVAILABLE',{timeout:30000});
  const browserNode=(await page.locator('.browser-node code').first().textContent()).trim();
  desktop=await _electron.launch({executablePath:resolve('.runtime/windows-worker/releases/win-unpacked/OMNICOMPILE Worker.exe'),env:{...process.env,OMNICOMPILE_WORKER_DATA_DIR:data},timeout:30000});desktopProcess=desktop.process();
  const window=await desktop.firstWindow();await window.locator('#invitation').fill(network.joinUrl);await window.locator('#consent').check();await window.locator('#enroll').click();
  const nativeStatus=window.locator('#status');await approve('NATIVE');await expect(nativeStatus).toHaveText('AVAILABLE',{timeout:30000});
  const nativeNode=(await window.evaluate(()=>window.omnicompile.snapshot())).nodeId;expect(nativeNode).not.toBe(browserNode);
  await window.locator('#rotate').click();await expect(nativeStatus).toHaveText('PAUSED');await window.locator('#connect').click();await expect(nativeStatus).toHaveText('AVAILABLE',{timeout:30000});expect((await window.evaluate(()=>window.omnicompile.snapshot())).nodeId).toBe(nativeNode);
  await page.getByRole('button',{name:'Rotate private credential'}).click();await expect(browserStatus).toHaveText('PAUSED');await page.getByRole('button',{name:'Resume contribution'}).click();await expect(browserStatus).toHaveText('AVAILABLE',{timeout:30000});expect((await page.locator('.browser-node code').first().textContent()).trim()).toBe(browserNode);
  if(includeAndroid){
    android=await startAndroidParticipant(process.env,network.joinUrl);await approve('ANDROID');
    await expect.poll(async()=>{const[rows]=await db.execute("SELECT id,profile_json FROM nodes WHERE network_id=? AND worker_type='ANDROID' AND status='AVAILABLE'",[network.id]);if(rows[0]){androidNode=rows[0].id;const profile=typeof rows[0].profile_json==='string'?JSON.parse(rows[0].profile_json):rows[0].profile_json;expect(profile.runtimes).toEqual({c:false,python:false,java:false});expect(profile.operations.nativeCompilation).toBe(false);}return Boolean(rows[0]);},{timeout:90000}).toBe(true);
  }
  const identities=[nativeNode,browserNode,...(androidNode?[androidNode]:[])];
  const[nodes]=await db.execute('SELECT id,network_id,worker_type,status FROM nodes WHERE network_id=?',[network.id]);expect(nodes).toHaveLength(identities.length);expect(new Set(nodes.map(node=>node.worker_type))).toEqual(new Set(includeAndroid?['BROWSER','NATIVE','ANDROID']:['BROWSER','NATIVE']));expect(new Set(identities).size).toBe(identities.length);await expect.poll(async()=>{const [current]=await db.execute('SELECT worker_type,status FROM nodes WHERE network_id=? ORDER BY worker_type',[network.id]);return current;},{timeout:30000,message:'Both enrolled workers must be scheduler-available in MySQL'}).toEqual((includeAndroid?['ANDROID','BROWSER','NATIVE']:['BROWSER','NATIVE']).map(worker_type=>({worker_type,status:'AVAILABLE'})));
  const submit=payload=>api('/api/admin/tasks/test',{networkId:network.id,payload});
  const policy=allowedWorkerTypes=>api('/api/admin/networks/'+network.id+'/policy',{allowedWorkerTypes},'PATCH');
  // Controlled user-facing pause makes each actual execution attributable.
  await policy(['NATIVE']);
  await page.getByRole('button',{name:'Pause contribution'}).click();await expect(browserStatus).toHaveText('PAUSED');
  const nativeTask=await submit({operation:'sha256',input:'abc'}),nativeResult=await completed(nativeTask);expect(nativeResult.node).toBe(nativeNode);expect(nativeResult.result.digest).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  await window.locator('#pause').click();await expect(nativeStatus).toHaveText('PAUSED');
  await page.getByRole('button',{name:'Resume contribution'}).click();await expect(browserStatus).toHaveText('AVAILABLE');
  await policy(['BROWSER']);
  const browserTask=await submit({operation:'prime_count',limit:100}),browserResult=await completed(browserTask);expect(browserResult.node).toBe(browserNode);expect(browserResult.result.count).toBe(25);
  await window.locator('#connect').click();await expect(nativeStatus).toHaveText('AVAILABLE');await expect(browserStatus).toHaveText('AVAILABLE');
  if(includeAndroid){
    await policy(['ANDROID']);
    for(const payload of [{operation:'sha256',input:'abc'},{operation:'prime_count',limit:100},{operation:'sha256_chain',input:'abc',iterations:1},{operation:'matrix_multiply',left:[[2,3]],right:[[4],[5]]},{operation:'portable_benchmark',seed:1,iterations:1}]){
      const result=await completed(await submit(payload));expect(result.node).toBe(androidNode);
      if(payload.operation==='sha256')expect(result.result.digest).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
      if(payload.operation==='prime_count')expect(result.result.count).toBe(25);
      if(payload.operation==='matrix_multiply')expect(result.result.matrix).toEqual([[23]]);
      if(payload.operation==='portable_benchmark')expect(result.result.checksum).toBe(1015568748);
    }
  }
  await policy(['BROWSER','NATIVE']);
  const burst=await Promise.all(Array.from({length:6},(_,index)=>submit({operation:'sha256',input:`mixed-${index}`})));
  for(const task of burst){const result=await completed(task);expect([nativeNode,browserNode]).toContain(result.node);}
  // Browser interruption must preserve attempts and reassign to the native peer.
  await window.locator('#pause').click();await expect(nativeStatus).toHaveText('PAUSED');
  await policy(['BROWSER']);
  const interrupted=await submit({operation:'sha256_chain',input:'recover on another real platform',iterations:1000000});
  await expect.poll(async()=>(await api('/api/admin/tasks/'+interrupted.id)).status,{timeout:30000,intervals:[50,100]}).toBe('RUNNING');
  await page.getByRole('button',{name:'Pause contribution'}).click();await expect(browserStatus).toHaveText('PAUSED');
  await policy(['NATIVE']);
  await window.locator('#connect').click();await expect(nativeStatus).toHaveText(/^(AVAILABLE|BUSY)$/,{timeout:30000});
  const recovered=await completed(interrupted);expect(recovered.node).toBe(nativeNode);
  const[attempts]=await db.execute('SELECT node_id,status FROM task_attempts WHERE task_id=? ORDER BY attempt',[interrupted.id]);expect(attempts.length).toBeGreaterThan(1);expect(attempts[0].node_id).toBe(browserNode);expect(attempts[0].status).not.toBe('COMPLETED');
  await page.getByRole('button',{name:'Resume contribution'}).click();await expect(browserStatus).toHaveText('AVAILABLE');
  await restart();await expect(browserStatus).toHaveText('AVAILABLE',{timeout:60000});await expect(nativeStatus).toHaveText('AVAILABLE',{timeout:60000});
  expect((await window.evaluate(()=>window.omnicompile.snapshot())).nodeId).toBe(nativeNode);expect((await page.locator('.browser-node code').first().textContent()).trim()).toBe(browserNode);
  // Do not accept stale AVAILABLE labels as reconnect proof. Policy routes fresh
  // work to each platform without manually reconnecting either client.
  for(const [workerType,nodeId] of [['NATIVE',nativeNode],['BROWSER',browserNode],...(androidNode?[['ANDROID',androidNode]]:[])]){
    await api('/api/admin/networks/'+network.id+'/policy',{allowedWorkerTypes:[workerType]},'PATCH');
    const final=await completed(await submit({operation:'prime_count',limit:20}));expect(final.node).toBe(nodeId);expect(final.result.count).toBe(8);
  }
  await api('/api/admin/networks/'+network.id+'/policy',{},'PATCH');
  if(android){await android.finish();const[left]=await db.execute('SELECT revoked_at FROM nodes WHERE id=?',[androidNode]);expect(left[0].revoked_at).toBeTruthy();}
  const[reconnected]=await db.execute('SELECT id FROM nodes WHERE network_id=?',[network.id]);expect(reconnected.map(row=>row.id).sort()).toEqual(identities.sort());
  expect(errors).toEqual([]);await page.screenshot({path:join(evidence,'mixed-browser.png')});await window.screenshot({path:join(evidence,'mixed-windows.png')});
  await page.getByRole('button',{name:'Leave network'}).click();await expect(page.getByRole('heading',{name:'Join distributed network'})).toBeVisible();
  await window.locator('#leave').click();await expect(nativeStatus).toHaveText('LEFT');
  console.log(JSON.stringify({platforms:['actual browser Web Worker','packaged Windows native worker',...(android?['physical Android native worker']:[])],sameCoordinator:true,sameNetwork:true,distinctIdentity:true,persistedResults:true,browserToNativeReassignment:true,coordinatorRestart:true,publicInternet:false,androidIncluded:Boolean(android)}));
}catch(error){failure=error;try{const[nodes]=await db.execute('SELECT id,status,profile_json,resource_json,last_heartbeat FROM nodes WHERE network_id=?',[network.id]);const[tasks]=await db.execute('SELECT id,status,required_capability,payload_json,scheduler_explanation FROM tasks WHERE network_id=?',[network.id]);await writeFile(join(evidence,'mixed-failure-state.json'),JSON.stringify({nodes,tasks},null,2));}catch{}throw error;}finally{
  const cleanupErrors=[];
  try{if(android)await android.cleanup(()=>api('/api/admin/networks/'+network.id+'/disable',{}));}catch(error){cleanupErrors.push(error);}
  try{if(browser)await browser.close();}catch(error){cleanupErrors.push(error);}
  try{if(desktop){let timer;try{await Promise.race([desktop.close(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Owned mixed desktop close timeout')),20000);})]);}finally{clearTimeout(timer);await terminateOwnedTestProcess(desktopProcess);}}}catch(error){cleanupErrors.push(error);}
  try{await db.end();}catch(error){cleanupErrors.push(error);}
  if(cleanupErrors.length)throw new AggregateError([...(failure?[failure]:[]),...cleanupErrors],'Mixed verification cleanup failed; all cleanup actions were attempted');
}
