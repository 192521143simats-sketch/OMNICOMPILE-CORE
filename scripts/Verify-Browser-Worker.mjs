import {chromium,expect,devices} from '@playwright/test';
import {createHash} from 'node:crypto';
import mysql from 'mysql2/promise';
import {assertIsolatedTarget,verifyIsolatedCoordinator} from './Integration-Target.mjs';
const target=assertIsolatedTarget();await verifyIsolatedCoordinator(target);
const base=process.env.OMNICOMPILE_TEST_WEB_BASE;if(!base||!/^https?:\/\/127\.0\.0\.1:\d+$/.test(base))throw new Error('Isolated web target required');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
const admin=await browser.newContext({baseURL:base,ignoreHTTPSErrors:base.startsWith('https:')}),user=await browser.newContext({baseURL:base,ignoreHTTPSErrors:base.startsWith('https:')});const errors=[];
const db=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),database:target.database,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
async function json(context,path,body){const response=await (body?context.request.post(path,{data:body,headers:{origin:base}}):context.request.get(path));expect(response.ok(),`${path}: ${response.status()}`).toBe(true);return response.status()===204?null:response.json();}
async function control(action){const id=crypto.randomUUID();await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Owned control timeout')),60000);function receive(message){if(message.id!==id)return;process.off('message',receive);clearTimeout(timer);message.error?reject(new Error(message.error)):resolve();}process.on('message',receive);process.send({id,recoveryAction:action});});}
try{
  await json(admin,'/api/auth/login',{identifier:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD});
  expect((await admin.request.get('/api/worker/me')).status()).toBe(401);
  await json(user,'/api/auth/signup',{name:'Browser acceptance',email:'browser-acceptance@example.test',password:'BrowserAcceptance!42',confirmPassword:'BrowserAcceptance!42'});await json(user,'/api/auth/login',{identifier:'browser-acceptance@example.test',password:'BrowserAcceptance!42'});
  const network=await json(admin,'/api/admin/networks',{name:'Browser Lifecycle Alpha',maxNodes:10});
  const beta=await json(admin,'/api/admin/networks',{name:'Browser Isolation Beta',maxNodes:2}),foreign=await json(admin,'/api/admin/tasks/test',{networkId:beta.id,payload:{operation:'sha256',input:'must stay isolated'}});
  const link=new URL(network.joinUrl).pathname;
  for(const mobile of [false,true]){
    const context=await browser.newContext({baseURL:base,ignoreHTTPSErrors:base.startsWith('https:'),...(mobile?devices['Pixel 7']:{})});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));const socketURLs=[];page.on('websocket',socket=>socketURLs.push(socket.url()));
    try{
      await page.goto(link);await page.getByRole('link',{name:/Continue as Web Worker/}).click();await page.getByRole('button',{name:'Become a Worker'}).click();
      await expect(page.getByLabel('Worker status')).toHaveText('AVAILABLE',{timeout:30000});
      if(base.startsWith('https:')){expect(await page.evaluate(()=>isSecureContext)).toBe(true);expect(socketURLs.some(url=>url.startsWith('wss:')&&url.endsWith('/ws/worker'))).toBe(true);}
      const duplicate=await context.newPage();await duplicate.goto('/worker');await expect(duplicate.getByLabel('Worker status')).toHaveText('AVAILABLE');await expect(page.getByLabel('Worker status')).toHaveText('DISCONNECTED');await expect(page.getByRole('alert')).toContainText('another tab');await duplicate.close();await page.getByRole('button',{name:'Resume contribution'}).click();await expect(page.getByLabel('Worker status')).toHaveText('AVAILABLE');
      const scope=await json(context,'/api/worker/me');expect(scope.workerType).toBe('BROWSER');expect(scope.networkId).toBe(network.id);expect(JSON.stringify(scope)).not.toMatch(/credential|token|password/i);
      const node=scope.nodeId;expect(node).toMatch(/^NODE-A\d{3}$/);
      await page.getByRole('button',{name:'Pause contribution'}).click();await expect(page.getByLabel('Worker status')).toHaveText('PAUSED');
      await page.reload();await expect(page.getByLabel('Worker status')).toHaveText('PAUSED');
      await expect.poll(async()=>{const nodes=await json(admin,'/api/admin/nodes?page=1&pageSize=10');return nodes.items.find(n=>n.id===node)?.status;},{timeout:10000}).toBe('OFFLINE');
      await page.getByRole('button',{name:'Resume contribution'}).click();await expect(page.getByLabel('Worker status')).toHaveText('AVAILABLE');
      await page.reload();await expect(page.getByLabel('Worker status')).toHaveText('AVAILABLE');expect((await json(context,'/api/worker/me')).nodeId).toBe(node);
      await context.setOffline(true);await expect(page.getByLabel('Worker status')).toHaveText('DISCONNECTED');await context.setOffline(false);await expect(page.getByLabel('Worker status')).toHaveText('AVAILABLE',{timeout:30000});
      // Pause the real renderer with CDP, not a fabricated heartbeat payload.
      // OS background/freeze delivery is separately covered by component events
      // and needs physical-device acceptance; headless Page.freeze was not reliable.
      const cdp=await context.newCDPSession(page);await cdp.send('Debugger.enable');await cdp.send('Debugger.pause');
      try{await expect.poll(async()=>{const nodes=await json(admin,'/api/admin/nodes?page=1&pageSize=10');return nodes.items.find(n=>n.id===node)?.status;},{timeout:40000}).toBe('OFFLINE');}finally{await cdp.send('Debugger.resume');await cdp.detach();}
      await expect(page.getByLabel('Worker status')).toHaveText('AVAILABLE',{timeout:30000});
      const workloads=[{operation:'sha256',input:'abc'},{operation:'prime_count',limit:20},{operation:'sha256_chain',input:'abc',iterations:1000},{operation:'matrix_multiply',left:[[1,2],[3,4]],right:[[5],[6]]},{operation:'portable_benchmark',seed:0,iterations:3}];
      for(const payload of workloads){
        const task=await json(admin,'/api/admin/tasks/test',{networkId:network.id,payload});
        try{await expect.poll(async()=>{const value=await json(admin,`/api/admin/tasks/${task.id}`);return value.status;},{timeout:30000}).toBe('COMPLETED');}catch(error){console.log('Owned browser fixture diagnostic:',JSON.stringify((await json(admin,'/api/admin/nodes?page=1&pageSize=10')).items.map(n=>({id:n.id,status:n.status,profile:n.profile,resources:n.resources}))));throw error;}
        const completed=await json(admin,`/api/admin/tasks/${task.id}`);expect(completed.attempts.at(-1).nodeId).toBe(node);
        const [rows]=await db.execute('SELECT result_json result FROM results WHERE task_id=? AND attempt=?',[task.id,completed.attempt]);expect(rows).toHaveLength(1);const result=typeof rows[0].result==='string'?JSON.parse(rows[0].result):rows[0].result;
        if(payload.operation==='sha256')expect(result.digest).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
        if(payload.operation==='prime_count')expect(result.count).toBe(8);
        if(payload.operation==='matrix_multiply')expect(result.matrix).toEqual([[17],[39]]);
        if(payload.operation==='portable_benchmark')expect(result.checksum).toBe(3519870697);
        if(payload.operation==='sha256_chain'){let value=Buffer.from('abc');for(let i=0;i<1000;i++)value=createHash('sha256').update(value).digest();expect(result.digest).toBe(value.toString('hex'));}
      }
      const native=await user.request.post('/api/compilations',{headers:{origin:base},data:{language:'python',sourceName:'sample.py',source:'print(1)'}});expect(native.status()).toBe(409);expect((await native.json()).error.message).toMatch(/native worker/i);
      const irId=`TASK-ir-${target.instance}-${mobile?'mobile':'desktop'}`,ir={name:'main',returnType:'int',parameters:[],instructions:[{op:'const',dest:'a',value:2},{op:'const',dest:'b',value:3},{op:'binary',dest:'c',operator:'+',left:'a',right:'b'},{op:'return',value:'c'}]};
      await db.execute("INSERT INTO tasks(id,network_id,kind,payload_json,required_capability,status,created_at,deadline_at) VALUES(?,?,'C_OPTIMIZE_IR',?,'ir','QUEUED',?,TIMESTAMPADD(SECOND,120,UTC_TIMESTAMP(3)))",[irId,network.id,JSON.stringify({operation:'c_optimize_ir',function:ir}),new Date().toISOString()]);
      await expect.poll(async()=>(await json(admin,`/api/admin/tasks/${irId}`)).status,{timeout:30000}).toBe('COMPLETED');
      const [irRows]=await db.execute('SELECT result_json result FROM results WHERE task_id=?',[irId]);const irResult=typeof irRows[0].result==='string'?JSON.parse(irRows[0].result):irRows[0].result;expect(irResult.function.instructions.some(instruction=>instruction.op==='const'&&instruction.value===5)).toBe(true);
      const interrupted=await json(admin,'/api/admin/tasks/test',{networkId:network.id,payload:{operation:'sha256_chain',input:'pause actual work',iterations:200000}});await expect(page.getByLabel('Worker status')).toHaveText('BUSY');await page.getByRole('button',{name:'Pause contribution'}).click();await expect(page.getByLabel('Worker status')).toHaveText('PAUSED');await expect.poll(async()=>(await json(admin,`/api/admin/tasks/${interrupted.id}`)).status).toBe('REQUEUED');await page.getByRole('button',{name:'Resume contribution'}).click();await expect.poll(async()=>(await json(admin,`/api/admin/tasks/${interrupted.id}`)).status,{timeout:30000}).toBe('COMPLETED');expect((await json(admin,`/api/admin/tasks/${interrupted.id}`)).attempts[0].status).toBe('INTERRUPTED');
      const slow=await json(admin,'/api/admin/tasks/test',{networkId:network.id,payload:{operation:'sha256_chain',input:'cancel me',iterations:1000000}});
      await expect(page.getByLabel('Worker status')).toHaveText('BUSY',{timeout:10000});
      await expect(page.getByLabel('Task computation progress')).toBeVisible();
      await json(admin,`/api/admin/tasks/${slow.id}/cancel`,{});await expect(page.getByLabel('Worker status')).toHaveText('AVAILABLE');expect((await json(admin,`/api/admin/tasks/${slow.id}`)).status).toBe('CANCELLED');
      if(!mobile){await control('restartCoordinator');await expect(page.getByLabel('Worker status')).toHaveText('AVAILABLE',{timeout:30000});expect((await json(context,'/api/worker/me')).nodeId).toBe(node);const afterRestart=await json(admin,'/api/admin/tasks/test',{networkId:network.id,payload:{operation:'prime_count',limit:20}});await expect.poll(async()=>(await json(admin,`/api/admin/tasks/${afterRestart.id}`)).status,{timeout:30000}).toBe('COMPLETED');}
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.close();await expect.poll(async()=>{const nodes=await json(admin,'/api/admin/nodes?page=1&pageSize=10');return nodes.items.find(n=>n.id===node)?.status;},{timeout:10000}).toBe('OFFLINE');
      const restored=await context.newPage();await restored.goto('/worker');await expect(restored.getByLabel('Worker status')).toHaveText('AVAILABLE');expect((await json(context,'/api/worker/me')).nodeId).toBe(node);
      await restored.getByRole('button',{name:'Leave network'}).click();await expect(restored.getByRole('heading',{name:'You left the network'})).toBeVisible();await expect(restored.getByRole('button',{name:'Leave network'})).toHaveCount(0);await expect.poll(async()=>(await context.request.get('/api/worker/me')).status()).toBe(401);
      const revokedContext=await browser.newContext({baseURL:base,ignoreHTTPSErrors:base.startsWith('https:'),...(mobile?devices['Pixel 7']:{})});try{const revoked=await revokedContext.newPage();await revoked.goto(link);await revoked.getByRole('link',{name:/Continue as Web Worker/}).click();await revoked.getByRole('button',{name:'Become a Worker'}).click();await expect(revoked.getByLabel('Worker status')).toHaveText('AVAILABLE');const scope=await json(revokedContext,'/api/worker/me');await json(admin,`/api/admin/nodes/${scope.nodeId}/revoke`,{});await expect(revoked.getByLabel('Worker status')).toHaveText('ERROR');expect((await revokedContext.request.get('/api/worker/me')).status()).toBe(401);}finally{await revokedContext.close();}
      console.log(`${mobile?'Android-emulated Chromium':'Desktop Edge'} actual Web Worker five workloads, progress/cancel, pause, reload, offline, reconnect, close and leave passed.`);
    }finally{await context.close();}
  }
  const isolated=await json(admin,`/api/admin/tasks/${foreign.id}`);expect(isolated.status).toBe('QUEUED');expect(isolated.attempt).toBe(0);await json(admin,`/api/admin/tasks/${foreign.id}/cancel`,{});
  expect(errors).toEqual([]);
}finally{await db.end();await user.close();await admin.close();await browser.close();if(process.connected)process.disconnect();}
