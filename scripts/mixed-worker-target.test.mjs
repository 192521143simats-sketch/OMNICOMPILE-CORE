import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('mixed-worker verification refuses developer targets before browser or desktop launch',()=>{
  const result=spawnSync(process.execPath,['scripts/Verify-Mixed-Workers.mjs'],{encoding:'utf8',windowsHide:true,timeout:15000,env:{...process.env,OMNICOMPILE_TEST_BASE:'http://127.0.0.1:4100',OMNICOMPILE_TEST_INSTANCE:'0123456789abcdef',DB_NAME:'omnicompile'}});
  assert.equal(result.status,1);
  assert.match(result.stderr,/isolated test database and instance/);
});
