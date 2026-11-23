import {chromium,expect} from '@playwright/test';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {assertIsolatedTarget,verifyIsolatedCoordinator} from './Integration-Target.mjs';

const target=assertIsolatedTarget();await verifyIsolatedCoordinator(target);
const base=process.env.OMNICOMPILE_TEST_WEB_BASE;
if(!base||!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)||[4100,5173].includes(Number(new URL(base).port)))throw new Error('Refusing non-isolated web target');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
const context=await browser.newContext({baseURL:base}),page=await context.newPage();
async function startNative(credential){
 if(typeof process.send!=="function")throw new Error("Web acceptance must run under its owned isolated runner.");
 const id=crypto.randomUUID();await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{process.off('message',received);reject(new Error("Native fixture start timed out"));},15000);function received(message){if(message.id!==id)return;clearTimeout(timer);process.off('message',received);message.error?reject(new Error(message.error)):resolve();}process.on('message',received);process.send({id,recoveryAction:'startNativeWorker',credential});});
}
const failures=[];page.on('pageerror',error=>failures.push(error.message));
const evidence=resolve(process.env.OMNICOMPILE_TEST_EVIDENCE??'');if(evidence!==resolve(process.env.OMNICOMPILE_TEST_EVIDENCE_ROOT??'.runtime/integration',target.instance))throw new Error('Owned screenshot directory required');
const screenshot=(subject,name)=>subject.screenshot({path:resolve(evidence,name),fullPage:true});
try{
  await page.goto('/');await expect(page.getByRole('heading',{name:'Compile Without Limits.'})).toBeVisible();
  await expect(page.getByRole('link',{name:'GET STARTED',exact:true})).toHaveCount(1);await expect(page.getByRole('link',{name:/Sign in|Register|Become a Worker/i})).toHaveCount(0);
  await screenshot(page,'ui-landing-desktop.png');
  await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Skip to content'})).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('#main-content')).toBeFocused();
  for(const [width,height] of [[320,568],[390,667],[390,844],[768,1024],[1024,600],[1440,900],[1920,1080]]){
    await page.setViewportSize({width,height});
    expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight && document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(page.locator('.landing-signature')).toBeInViewport({ratio:1});
  }
  await page.setViewportSize({width:1280,height:720});
  await page.getByRole('link',{name:'GET STARTED',exact:true}).click();await expect(page).toHaveURL(base+"/login");await expect(page.locator('header nav').getByRole('link',{name:'Login',exact:true})).toHaveCount(0);
  await page.goto('/signup');await expect(page.locator('header nav').getByRole('link',{name:'Login',exact:true})).toHaveCount(0);
  await page.getByLabel('Name',{exact:true}).fill('Web Acceptance');
  await page.getByLabel('Email',{exact:true}).fill('web-acceptance@example.test');
  await page.getByLabel('Password',{exact:true}).fill('WebAcceptance!42');
  await page.getByLabel('Confirm password',{exact:true}).fill('WebAcceptance!42');
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(page).toHaveURL(/\/login\?created=1/);
  await page.getByLabel('Username or email').fill('web-acceptance@example.test');
  await page.getByLabel('Password',{exact:true}).fill('WebAcceptance!42');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading',{name:'Compiler workspace',exact:true})).toBeVisible();
  await expect(page.getByLabel('Source code',{exact:true})).toHaveValue('');
  for(const language of ['python','java','c']){await page.getByLabel('Language',{exact:true}).selectOption(language);await expect(page.getByLabel('Source code',{exact:true})).toHaveValue('');}
  await expect(page.locator('header nav a')).toHaveCount(1);
  await expect(page.locator('header nav a')).toHaveText('Compiler');
  await expect(page.getByRole('link',{name:'Compute Tasks',exact:true})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Settings',exact:true})).toHaveCount(0);
  for(const legacy of ['/compute','/settings']){await page.goto(legacy);await expect(page).toHaveURL(/\/dashboard$/);await expect(page.getByRole('heading',{name:'Compiler workspace',exact:true})).toBeVisible();}
  const noWorker=await context.request.post('/api/compute/tasks',{headers:{origin:base},data:{payload:{operation:'sha256',input:'abc'}}});
  expect(noWorker.status()).toBe(503);expect((await noWorker.json()).error.code).toBe('NO_COMPATIBLE_NETWORK');
  const saved=await context.request.patch('/api/user/settings',{headers:{origin:base},data:{reducedMotion:true}});
  expect(saved.status()).toBe(200);expect((await saved.json()).reducedMotion).toBe(true);
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-reduced-motion','true');
  const sessions=await (await context.request.get('/api/user/settings/sessions')).json();
  expect(sessions.items.some(item=>item.current)).toBe(true);
  expect(JSON.stringify(sessions)).not.toContain('tokenHash');
  expect((await context.cookies()).find(cookie=>cookie.name==='omnicompile_session')?.httpOnly).toBe(true);
  const adminContext=await browser.newContext({baseURL:base}),admin=await adminContext.newPage();
  try{
    await admin.goto('/login');
    await expect(admin.getByLabel('Username or email')).toBeVisible();await screenshot(admin,'ui-login-desktop.png');
    await admin.getByLabel('Username or email').fill(process.env.ADMIN_USERNAME);
    await admin.getByLabel('Password',{exact:true}).fill(process.env.ADMIN_PASSWORD);
    await admin.getByRole('button',{name:'Sign in',exact:true}).click();
    await expect(admin).toHaveURL(/\/admin$/);
    expect((await context.request.get('/api/admin/overview')).status()).toBe(403);
    await admin.getByLabel('Name',{exact:true}).fill('Browser Acceptance Alpha');
    await admin.getByRole('button',{name:'Create network and master link',exact:true}).click();
    await expect(admin.getByText('Master network link',{exact:true})).toHaveCount(0);
    await admin.getByRole('button',{name:'Show / copy link',exact:true}).click();
    await expect(admin.getByLabel('Master network link',{exact:true})).toBeVisible();
    const headings=await admin.locator('h2').allTextContents();
    expect(headings.indexOf('Create network and master link')).toBeLessThan(headings.indexOf('Execution toolchains'));
    expect(headings.indexOf('Execution toolchains')).toBeLessThan(headings.indexOf('Networks and worker nodes'));
    await expect(admin.getByRole('heading',{name:'Scoped invitations'})).toHaveCount(0);
    await admin.getByRole('button',{name:'Copy',exact:true}).click();
    await expect(admin.getByRole('status').filter({hasText:'Link copied.'})).toBeVisible();
    const network=(await (await adminContext.request.get('/api/admin/networks?page=1&pageSize=10')).json()).items[0];
    async function approveEnrollment(workerType,enrollmentId){let pending;await expect.poll(async()=>{const response=await adminContext.request.get(`/api/admin/networks/${network.id}/enrollments?page=1&pageSize=10`);pending=(await response.json()).items.find(item=>item.approvalStatus==='PENDING'&&item.workerType===workerType&&(!enrollmentId||item.enrollmentId===enrollmentId));return Boolean(pending);},{timeout:30000}).toBe(true);await admin.getByRole('button',{name:'Refresh enrollments',exact:true}).click();await admin.getByRole('row').filter({hasText:pending.enrollmentId}).getByRole('button',{name:'Approve',exact:true}).click();}
    expect((await adminContext.request.get(`/api/admin/networks/${network.id}/policy`)).status()).toBe(404);
    await expect(admin.getByRole('button',{name:'Scheduling policy',exact:true})).toHaveCount(0);
    await expect(admin.getByRole('heading',{name:'Network details',exact:true})).toHaveCount(0);
    const joinURL=await admin.getByLabel('Master network link',{exact:true}).inputValue();
    expect(new URL(joinURL).pathname).toMatch(/^\/join-network-a\//);
    const workerContext=await browser.newContext({baseURL:base}),workerPage=await workerContext.newPage();
    try{
      workerPage.on('pageerror',error=>failures.push(error.message));
      await workerPage.goto(joinURL);await workerPage.getByRole('link',{name:/Continue as Web Worker/}).click();await workerPage.getByRole('button',{name:'Become a Worker'}).click();
      await approveEnrollment('BROWSER');
      await expect(workerPage.getByText('NODE-A001',{exact:true})).toBeVisible();
      await expect(workerPage.locator('.status-available')).toBeVisible({timeout:30000});
      await admin.getByRole('switch',{name:'Admission for Browser Acceptance Alpha'}).click();
      const revokedContext=await browser.newContext({baseURL:base}),revokedPage=await revokedContext.newPage();
      await revokedPage.goto(joinURL);await expect(revokedPage.getByRole('heading',{name:'Network link expired',exact:true})).toBeVisible();await revokedContext.close();
      await admin.getByRole('switch',{name:'Admission for Browser Acceptance Alpha'}).click();
      const mobileContext=await browser.newContext({baseURL:base,viewport:{width:390,height:844},isMobile:true,hasTouch:true}),mobile=await mobileContext.newPage();
      try{
        await mobile.goto(joinURL);await expect(mobile.getByRole('link',{name:/Continue as Android Worker/})).toBeVisible();await expect(mobile.getByRole('link',{name:/Continue as Windows Worker/})).toBeVisible();await mobile.getByRole('link',{name:/Continue as Web Worker/}).click();await expect(mobile.getByRole('button',{name:'Become a Worker'})).toBeVisible();await screenshot(mobile,'ui-join-mobile.png');await mobile.getByRole('button',{name:'Become a Worker'}).click();await approveEnrollment('BROWSER');await expect(mobile.getByText('NODE-A002',{exact:true})).toBeVisible();
        expect(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        const taskResponse=await context.request.post('/api/compute/tasks',{headers:{origin:base},data:{payload:{operation:'sha256',input:'abc'}}});
        expect(taskResponse.status()).toBe(201);const portableTask=await taskResponse.json();
        await expect.poll(async()=>{const detail=await (await context.request.get(`/api/compute/tasks/${portableTask.id}`)).json();return detail.result?.result?.digest;},{timeout:30000}).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
        const credentialResponse=await fetch(target.base+'/api'+new URL(joinURL).pathname+'/accept',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({consent:true,workerType:'NATIVE',deviceIdentity:'web-native-toolchain-fixture'})});
        expect(credentialResponse.status).toBe(201);const enrollment=await credentialResponse.json();
        await approveEnrollment('NATIVE',enrollment.enrollmentId);
        await startNative(enrollment.workerCredential);
        await expect.poll(async()=>{const nodes=await (await adminContext.request.get('/api/admin/nodes?page=1&pageSize=10')).json();return nodes.items.some(node=>node.workerType==='NATIVE'&&node.status==='AVAILABLE');},{timeout:30000}).toBe(true);
        await mobile.getByRole('button',{name:'Leave network'}).click();await expect(mobile.getByRole('heading',{name:'Join distributed network',exact:true})).toBeVisible();await mobileContext.close();await workerContext.close();
        console.log('Browser/mobile-layout enrollment, reusable link toggle and real portable task verified; native pipeline checks starting.');
        async function waitNative(language){await expect.poll(async()=>{const nodes=await (await adminContext.request.get('/api/admin/nodes?page=1&pageSize=10')).json();return nodes.items.some(node=>node.workerType==='NATIVE'&&node.status==='AVAILABLE'&&node.profile.runtimes[language]&&node.resources?.freeMemoryBytes>=536870912);},{timeout:30000}).toBe(true);}

        for(const item of [{language:'c',file:'sample-c-easy.c'},{language:'python',file:'sample-python-easy.py'},{language:'java',file:'sample-java-easy.java'}]){
          await expect.poll(async()=>{const nodes=await (await adminContext.request.get('/api/admin/nodes?page=1&pageSize=10')).json();return nodes.items.some(node=>node.workerType==='NATIVE'&&node.status==='AVAILABLE'&&node.profile.runtimes[item.language]&&node.resources?.freeMemoryBytes>=536870912);},{timeout:30000}).toBe(true);
          await page.goto('/dashboard');await page.getByLabel('Language',{exact:true}).selectOption(item.language);
          await expect(page.getByLabel('Compilation worker preference')).toHaveCount(0);
          let fixtureSource=await readFile(resolve('samples',item.language,item.file),'utf8');
          if(item.language==='python')fixtureSource+='\nif False:\n    print("UNREACHABLE_TEST_MARKER")\n';
          else if(item.language==='java'){
            const entry='public static void main(String[] args) {';expect(fixtureSource).toContain(entry);
            fixtureSource=fixtureSource.replace(entry,entry+' if(false){System.out.println("UNREACHABLE_TEST_MARKER");}');
          }else{
            const returned='return total == 49995000;';expect(fixtureSource).toContain(returned);
            fixtureSource=fixtureSource.replace(returned,returned+'99+1;');
          }
          await page.getByLabel('Upload source file').setInputFiles({name:item.file,mimeType:'text/plain',buffer:Buffer.from(fixtureSource)});
          await waitNative(item.language);
          const submission=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/compilations'&&response.request().method()==='POST');
          await page.getByRole('button',{name:'Compile and optimize',exact:true}).click();
          const admission=await submission;expect(admission.status(),JSON.stringify(await admission.json())).toBe(202);
          await expect(page.getByRole('heading',{name:'Generated artifacts'})).toBeVisible({timeout:120000});
          const liveMetrics=page.getByTestId('compiler-metrics');
          await expect(liveMetrics.getByRole('heading',{name:'Live performance · your jobs'})).toBeVisible();
          await expect(liveMetrics.locator('article')).toHaveCount(6);
          const optimizationCard=liveMetrics.locator('article').nth(2);
          await expect(optimizationCard.getByRole('heading',{name:'3. Optimization evidence',exact:true})).toBeVisible();
          await expect(optimizationCard).toContainText('1 completed jobs with evidence',{timeout:15000});
          await expect(optimizationCard).toContainText(item.language==='c'?/artifact-bytes|ir-cost/:item.language==='python'?'ast-nodes':'ast-operators');
          await expect(optimizationCard).toContainText('Runtime speedup');
          await expect(optimizationCard).toContainText('Dead-code elimination');
          await expect(optimizationCard).toContainText(item.language==='c'?'compiler-managed':'applied');
          await expect(optimizationCard).toContainText('Not measured');
          await expect(liveMetrics.getByText('1 / 1 completed outcomes successful',{exact:true})).toBeVisible({timeout:15000});
          await expect(liveMetrics.getByText('0 / 0 completed verification attempts verified',{exact:true})).toHaveCount(0);
          const compileButton=await page.getByRole('button',{name:'Compile and optimize',exact:true}).boundingBox();expect(compileButton?.height).toBeLessThan(80);
          await screenshot(page,`ui-compiler-${item.language}-desktop.png`);
          const reports=page.locator('.artifact-list li').filter({hasText:'Build report (JSON)'});
          const downloading=page.waitForEvent('download');await reports.getByRole('link',{name:'Download',exact:true}).click();const download=await downloading;
          expect(download.suggestedFilename()).toBe('build-report.json');const report=JSON.parse(await readFile(await download.path(),'utf8'));
          expect(report.compilationSummary.sourceFile).toBe(item.file);expect(report.finalResult.status).toBe('SUCCESS');
          expect(report.optimizationEvidence.deadCodeElimination.status).toBe(item.language==='c'?'compiler-managed':'applied');
          if(item.language==='c'){
            expect(report.optimizationEvidence.compiler.options).toEqual(expect.arrayContaining(['-fdce','-ftree-dce']));
            expect(report.optimizationEvidence.deadCodeElimination.removedInstructions).toBeNull();
          }else expect(report.optimizationEvidence.deadCodeElimination.removedStatements).toBeGreaterThan(0);
          expect(report.optimizationEvidence.runtimeSpeedupPercent).toBeNull();
          expect(report.output.optimizedSource).not.toContain('UNREACHABLE_TEST_MARKER');
          console.log(`Actual ${item.language} source upload, native compilation, report and download passed.`);
        }
        for(const item of [
          {language:'c',name:'main.c',source:'int main(void) {\n int x=1;\n return missing;\n}\n'},
          {language:'python',name:'main.py',source:'def main():\n    x = 1\n    return (\n'},
          {language:'java',name:'Main.java',source:'public class Main {\n public static void main(String[] args) {\n  System.out.println(missing);\n }\n}'},
        ]){
          await page.goto('/dashboard');
          await page.getByLabel('Language',{exact:true}).selectOption(item.language);
          await expect(page.getByLabel('Compilation worker preference')).toHaveCount(0);
          await page.getByLabel('Upload source file').setInputFiles({name:item.name,mimeType:'text/plain',buffer:Buffer.from(item.source)});
          await waitNative(item.language);
          const submitted=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/compilations'&&response.request().method()==='POST');
          await page.getByRole('button',{name:'Compile and optimize',exact:true}).click();
          const response=await submitted;expect(response.status()).toBe(202);const job=await response.json();
          let detail;
          await expect.poll(async()=>{detail=await (await context.request.get(`/api/compilations/${job.id}`)).json();return detail.status;},{timeout:60000}).toBe('FAILED');
          expect(detail.error).toMatch(/Line 3, column [1-9]\d*:/);
          await expect(page.getByRole('alert').filter({hasText:'Compilation failed'}).locator('pre')).toContainText(/Line 3, column [1-9]\d*:/);
          console.log(`Actual ${item.language} failed job persisted and displayed compiler line3/column.`);
        }
        await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.setViewportSize({width:1280,height:720});
        await admin.getByRole('button',{name:'Tasks & jobs'}).click();await admin.getByRole('button',{name:'Inspect job'}).first().click();await expect(admin.getByRole('heading',{name:'Job details'})).toBeVisible();await admin.getByRole('button',{name:'Close details'}).click();
        await admin.getByRole('button',{name:'Inspect task'}).first().click();await expect(admin.getByRole('heading',{name:'Task details'})).toBeVisible();await admin.getByRole('button',{name:'Close details'}).click();
        await admin.getByRole('button',{name:'Overview',exact:true}).click();await admin.getByRole('button',{name:'Inspect node'}).first().click();await expect(admin.getByRole('heading',{name:'Node details'})).toBeVisible();await admin.getByRole('button',{name:'Close details'}).click();
        await screenshot(admin,'ui-admin-desktop.png');
        await admin.getByRole('button',{name:'Disable',exact:true}).click();
        await expect.poll(async()=>{const snapshot=await (await adminContext.request.get('/api/admin/overview')).json();return snapshot.summary.onlineWorkers;},{timeout:3000}).toBe(0);
        await expect(admin.getByText('Browser Acceptance Alpha',{exact:true})).toHaveCount(0);
      }finally{await mobileContext.close();}
    }finally{await workerContext.close();}
  }finally{await adminContext.close();}
  expect(failures).toEqual([]);
  await page.goto('/forgot-password');await page.getByLabel('Email',{exact:true}).fill('web-acceptance@example.test');await page.getByRole('button',{name:'Request reset',exact:true}).click();
  const resetURL=await page.getByRole('link',{name:'Open local development reset link'}).getAttribute('href');
  await page.goto(resetURL);await page.getByLabel('New password',{exact:true}).fill('UpdatedAcceptance!42');await page.getByLabel('Confirm password',{exact:true}).fill('UpdatedAcceptance!42');
  await page.getByRole('button',{name:'Update password',exact:true}).click();await expect(page).toHaveURL(/\/login\?reset=1/);
  expect((await context.request.get('/api/user/settings')).status()).toBe(401);
  await page.getByLabel('Username or email').fill('web-acceptance@example.test');await page.getByLabel('Password',{exact:true}).fill('UpdatedAcceptance!42');await page.getByRole('button',{name:'Show password',exact:true}).click();await expect(page.getByLabel('Password',{exact:true})).toHaveAttribute('type','text');await page.getByRole('button',{name:'Hide password',exact:true}).click();
  await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('button',{name:'Logout',exact:true}).click();await expect(page).toHaveURL(/\/login$/);
  expect((await context.request.get('/api/user/settings')).status()).toBe(401);
  console.log('Actual Edge compiler-only user routing, signup/login/reset/logout, preserved settings API, safe task admission, HttpOnly sessions, admin RBAC and network copy passed.');
}finally{await context.close();await browser.close();if(process.connected)process.disconnect();}
