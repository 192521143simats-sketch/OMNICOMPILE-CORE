import assert from 'node:assert/strict';
import test from 'node:test';
import {fixtureWorkerUser} from './Fixture-Identity.mjs';

test('Linux private credential fixtures use the runner identity, not the image UID',()=>{
  assert.deepEqual(fixtureWorkerUser('linux',1001,127),['--user','1001:127']);
});
test('Windows keeps the existing non-root image identity',()=>{
  assert.deepEqual(fixtureWorkerUser('win32'),[]);
});
test('Linux fixtures reject root and invalid identities instead of broadening secret permissions',()=>{
  for(const [uid,gid]of [[0,0],[-1,1000],[1000,-1],[NaN,1000],[1000,Infinity]]) {
    assert.throws(()=>fixtureWorkerUser('linux',uid,gid),/non-root Linux test runner/);
  }
});
