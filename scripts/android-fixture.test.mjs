import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {androidFixtureTarget,assertAndroidForegroundReady,androidAcceptanceArtifacts} from './Android-Fixture.mjs';
test('side-by-side acceptance selects separate packages and storage without replacing the normal app',()=>{
 const normal=androidAcceptanceArtifacts({}),isolated=androidAcceptanceArtifacts({OMNICOMPILE_ANDROID_ACCEPTANCE:'1'});assert.equal(normal.applicationId,'org.omnicompile.worker');assert.equal(isolated.applicationId,'org.omnicompile.worker.acceptance');assert.match(isolated.apk,/build-acceptance/);assert.notEqual(normal.testApk,isolated.testApk);assert.throws(()=>androidAcceptanceArtifacts({OMNICOMPILE_ANDROID_ACCEPTANCE:'arbitrary.package'}));
});
test('a connected but asleep or locked phone is not accepted as foreground evidence',()=>{
 assert.throws(()=>assertAndroidForegroundReady('mWakefulness=Asleep','showing=false'),/Unlock/);
 assert.throws(()=>assertAndroidForegroundReady('mWakefulness=Awake','  mIsShowing=true'),/keyguard/);
 assert.doesNotThrow(()=>assertAndroidForegroundReady('mWakefulness=Awake','showing=false\nmIsShowing=false'));
});
const instance='1234567890abcdef';
const safe={OMNICOMPILE_TEST_INSTANCE:instance,DB_NAME:`omnicompile_test_${instance}`,OMNICOMPILE_TEST_BASE:'http://127.0.0.1:49152',OMNICOMPILE_TEST_WEB_BASE:'http://127.0.0.1:49153',OMNICOMPILE_TEST_EVIDENCE:resolve('.runtime/integration',instance)};
test('Android mixed participant cannot redirect ADB or logs outside the owned fixture',()=>{
  const actual=androidFixtureTarget(safe,'http://127.0.0.1:49153/join/abcdefghijklmnopqrstuvwxyz');
  assert.equal(actual.mapping,'tcp:49153');
  assert.equal(actual.evidence,resolve('.runtime/integration',instance));
  for(const replacement of [{DB_NAME:'omnicompile'},{OMNICOMPILE_TEST_WEB_BASE:'http://127.0.0.1:5173'},{OMNICOMPILE_TEST_WEB_BASE:'https://public.example.com'},{OMNICOMPILE_TEST_EVIDENCE:resolve('apps')}])assert.throws(()=>androidFixtureTarget({...safe,...replacement},'http://127.0.0.1:49153/join/abcdefghijklmnopqrstuvwxyz'));
  for(const link of ['http://127.0.0.1:49154/join/abcdefghijklmnopqrstuvwxyz','http://user:secret@127.0.0.1:49153/join/abcdefghijklmnopqrstuvwxyz','http://127.0.0.1:49153/join/abcdefghijklmnopqrstuvwxyz?credential=no'])assert.throws(()=>androidFixtureTarget(safe,link));
});
