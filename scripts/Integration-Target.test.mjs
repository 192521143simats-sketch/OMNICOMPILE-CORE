import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertIsolatedTarget, verifyIsolatedCoordinator} from './Integration-Target.mjs';

const valid={OMNICOMPILE_TEST_BASE:'http://127.0.0.1:49152',DB_NAME:'omnicompile_test_1234567890abcdef',OMNICOMPILE_TEST_INSTANCE:'1234567890abcdef'};
test('refuses developer database/ports and remote targets before integration writes',()=>{
  assert.equal(assertIsolatedTarget(valid).base,'http://127.0.0.1:49152');
  for(const replacement of [{DB_NAME:'omnicompile'},{OMNICOMPILE_TEST_BASE:'http://localhost:4100'},{OMNICOMPILE_TEST_BASE:'https://remote.example:49152'},{OMNICOMPILE_TEST_INSTANCE:''},{OMNICOMPILE_TEST_BASE:'http://127.0.0.1:49152/path'}]) assert.throws(()=>assertIsolatedTarget({...valid,...replacement}),/isolated/i);
});
test('rejects wrong server even if process environment claims an isolated database',async()=>{
  const target=assertIsolatedTarget(valid);
  await assert.rejects(verifyIsolatedCoordinator(target,async()=>({ok:true,json:async()=>({status:'ready',testInstance:'other'})})),/identity/);
  await assert.rejects(verifyIsolatedCoordinator(target,async()=>({ok:false,json:async()=>({})})),/ready/);
  await verifyIsolatedCoordinator(target,async()=>({ok:true,json:async()=>({status:'ready',testInstance:valid.OMNICOMPILE_TEST_INSTANCE})}));
});
