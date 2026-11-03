import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

test('native Android verifier rejects developer targets before any device operation',()=>{
  const result=spawnSync(process.execPath,[resolve('scripts/Verify-Android-Native.mjs')],{encoding:'utf8',windowsHide:true,timeout:15000,env:{...process.env,OMNICOMPILE_TEST_BASE:'http://127.0.0.1:4100',OMNICOMPILE_TEST_INSTANCE:'0123456789abcdef',DB_NAME:'omnicompile',OMNICOMPILE_ADB:'deliberately-unavailable-adb'}});
  assert.equal(result.status,1);
  assert.match(result.stderr,/isolated test database and instance/);
  assert.doesNotMatch(result.stderr,/ENOENT|deliberately-unavailable-adb/);
});
