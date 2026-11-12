import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {assertIsolatedTarget,verifyIsolatedCoordinator} from './Integration-Target.mjs';
import {terminateOwnedTestProcess} from './Owned-Test-Process.mjs';

export function assertAndroidForegroundReady(power,window){
  assert.match(power,/mWakefulness=Awake\b/,'Unlock the phone and keep OMNICOMPILE visible for the physical foreground test');
  assert.doesNotMatch(window,/^\s*(?:showing|mIsShowing)=true\b/m,'Phone keyguard is showing; unlock it before foreground-worker acceptance');
}
export function androidAcceptanceArtifacts(env){
  assert.ok(env.OMNICOMPILE_ANDROID_ACCEPTANCE===undefined||['0','1'].includes(env.OMNICOMPILE_ANDROID_ACCEPTANCE),'Invalid Android acceptance mode');
  const isolated=env.OMNICOMPILE_ANDROID_ACCEPTANCE==='1',applicationId=isolated?'org.omnicompile.worker.acceptance':'org.omnicompile.worker',directory=isolated?'build-acceptance':'build';
  return{applicationId,apk:`apps/android-worker/app/${directory}/outputs/apk/debug/app-debug.apk`,testApk:`apps/android-worker/app/${directory}/outputs/apk/androidTest/debug/app-debug-androidTest.apk`};
}

export async function assertInstalledAndroidApk(adb,serial,packagePath,file){
  assert.match(packagePath,/^package:\/data\/app\/[A-Za-z0-9_./=+~-]+\.apk$/);
  const expected=await readFile(file);
  // Android 7.1 may not provide sha256sum. Read the exact installed APK bytes
  // without a PTY and check the same SHA-256 digest on the host.
  const installed=execFileSync(adb,['-s',serial,'exec-out','cat',packagePath.slice('package:'.length)],{
    windowsHide:true,timeout:60000,maxBuffer:expected.length+1
  });
  assert.equal(createHash('sha256').update(installed).digest('hex'),
    createHash('sha256').update(expected).digest('hex'),'Installed APK differs from current verified build.');
}

export function androidFixtureTarget(env,joinUrl){
  const target=assertIsolatedTarget(env),web=new URL(env.OMNICOMPILE_TEST_WEB_BASE),link=new URL(joinUrl);
  assert.equal(web.protocol,'http:');assert.equal(web.hostname,'127.0.0.1');
  assert.ok(web.port&&!['4100','5173'].includes(web.port));assert.equal(web.href,web.origin+'/');
  assert.equal(link.origin,web.origin);assert.equal(link.username,'');assert.equal(link.password,'');assert.equal(link.search,'');assert.equal(link.hash,'');
  assert.match(link.pathname,/^\/join\/[A-Za-z0-9_-]{16,256}$/);
  const evidence=resolve('.runtime/integration',target.instance);assert.equal(resolve(env.OMNICOMPILE_TEST_EVIDENCE),evidence);
  return{...target,evidence,mapping:`tcp:${web.port}`};
}

/** Native instrumentation participant; never resets app data or replaces ADB mappings. */
export async function startAndroidParticipant(env,joinUrl){
  const target=androidFixtureTarget(env,joinUrl);await verifyIsolatedCoordinator(target);
  const adb=env.OMNICOMPILE_ADB??'adb';
  const run=args=>execFileSync(adb,args,{encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:2_000_000});
  const devices=run(['devices']).split(/\r?\n/).filter(line=>/^\S+\s+device$/.test(line.trim())).map(line=>line.split(/\s+/)[0]);
  const serial=env.ANDROID_SERIAL??(devices.length===1?devices[0]:undefined);assert.ok(serial&&devices.includes(serial),'An authorized physical Android device is required');
  const phone=(...args)=>run(['-s',serial,...args]);
  assertAndroidForegroundReady(phone('shell','dumpsys','power'),phone('shell','dumpsys','window','policy'));
  const artifacts=androidAcceptanceArtifacts(env);
  for(const[name,file]of[[artifacts.applicationId,artifacts.apk],[artifacts.applicationId+'.test',artifacts.testApk]]){
    await assertInstalledAndroidApk(adb,serial,phone('shell','pm','path',name).trim(),file);
  }
  assert.ok(!phone('reverse','--list').split(/\r?\n/).some(line=>line.split(/\s+/).includes(target.mapping)),'Existing ADB reverse mapping must not be replaced');
  const model=phone('shell','getprop','ro.product.model').trim();
  phone('reverse',target.mapping,target.mapping);
  let child,done,launchTimer,launchError,output='';
  try{
    child=spawn(adb,['-s',serial,'shell','am','instrument','-w','-r','-e','class','org.omnicompile.worker.NativeNetworkTest','-e','omnicompileJoin',joinUrl,'-e','omnicompileInstance',target.instance,'-e','omnicompileCompletedTasks','7',artifacts.applicationId+'.test/androidx.test.runner.AndroidJUnitRunner'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    if(env.OMNICOMPILE_ANDROID_ACCEPTANCE==='1'){
      // Some Android builds defer ActivityScenario's launch from an
      // instrumented process. Start only the disposable fixture's activity.
      launchTimer=setTimeout(()=>{
        if(child.exitCode!==null)return;
        try{
          const resumed=phone('shell','dumpsys','activity','activities').split(/\r?\n/).filter(line=>/topResumedActivity|mResumedActivity/.test(line));
          if(!resumed.some(line=>line.includes(artifacts.applicationId+'/'))){
            phone('shell','am','start','-a','android.intent.action.MAIN','-c','android.intent.category.LAUNCHER','-f','0x14008000','-n',artifacts.applicationId+'/org.omnicompile.worker.MainActivity');
          }
        }catch(error){launchError=error;}
      },8000);
    }
    const capture=chunk=>{output+=chunk.toString();if(output.length>2_000_000)child.kill();};child.stdout.on('data',capture);child.stderr.on('data',capture);
    done=new Promise(resolve=>{child.once('error',error=>{output+=`\nInstrumentation launch failed: ${error.message}`;resolve(-1);});child.once('exit',code=>resolve(code));});
  }catch(error){phone('reverse','--remove',target.mapping);throw error;}
  const diagnostic=()=>output.replaceAll(joinUrl,'[REDACTED admission URL]').slice(-3500);
  return{
    model,
    assertRunning(){
      if(launchError)throw new Error('Android acceptance activity launch failed.',{cause:launchError});
      if(child.exitCode!==null)throw new Error('Android instrumentation ended before enrollment. '+diagnostic());
    },
    async finish(){let timer;try{assert.equal(await Promise.race([done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Android mixed lifecycle timed out')),90000);})]),0);assert.match(output,/OK \(1 test\)/,diagnostic());assert.doesNotMatch(output,/FAILURES!!!|INSTRUMENTATION_FAILED/);}finally{clearTimeout(timer);}},
    async cleanup(revoke){clearTimeout(launchTimer);const errors=[];let timer;try{if(child.exitCode===null){await revoke();await Promise.race([done,new Promise(resolve=>{timer=setTimeout(resolve,60000);})]);if(child.exitCode===null)await terminateOwnedTestProcess(child);}}catch(error){errors.push(error);}finally{clearTimeout(timer);}try{phone('reverse','--remove',target.mapping);}catch(error){errors.push(error);}try{await writeFile(resolve(target.evidence,'mixed-android-instrumentation.log'),output.replaceAll(joinUrl,'[REDACTED admission URL]'));}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Android fixture cleanup failed');}
  };
}
