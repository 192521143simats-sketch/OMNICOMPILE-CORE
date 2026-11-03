import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CredentialRotation} from './credential-rotation.cjs';
import rotationModule from './credential-rotation.cjs';
test('initial enrollment preserves identity for replacement import after app restart',async()=>{
  const enrolled={workerCredential:'original-private-credential',networkId:'n1',enrollmentId:'e1'};
  const identity=rotationModule.enrollmentIdentity({deviceIdentity:'d1'},'https://omnicompile.example.com',enrolled,{maxCpuPercent:80});
  const restarted=JSON.parse(JSON.stringify(identity));let saved;
  const result=await new CredentialRotation().import(restarted,'replacement-private-credential','e1','',async()=>({networkId:'n1',enrollmentId:'e1',nodeId:'NODE-A001',workerType:'NATIVE'}),async value=>{saved=value;});
  assert.equal(result.enrollmentId,'e1');assert.equal(saved.deviceIdentity,'d1');
  assert.throws(()=>rotationModule.enrollmentIdentity({},'https://omnicompile.example.com',{...enrolled,enrollmentId:undefined},{}),/Invalid enrollment response/);
});
test('a failed protected save retries the same replacement without rotating twice',async()=>{
  const rotation=new CredentialRotation();let requests=0,saves=0;const original={credential:'old-private-credential',networkId:'n1',deviceIdentity:'d1'};
  const request=async()=>{requests++;return{workerCredential:'replacement-private-credential'};};
  const save=async identity=>{saves++;assert.equal(identity.networkId,'n1');if(saves===1)throw Error('disk unavailable');};
  await assert.rejects(rotation.rotate(original,request,save),/Retry credential rotation/);assert.equal(requests,1);
  const updated=await rotation.rotate(original,request,save);assert.equal(updated.credential,'replacement-private-credential');assert.equal(requests,1);assert.equal(saves,2);
});
test('credential import verifies enrollment, network and known node before protected save',async()=>{
  const rotation=new CredentialRotation(),identity={credential:'old-private-credential',networkId:'n1',enrollmentId:'e1'};let saved=false;
  const scope={networkId:'n1',enrollmentId:'e1',nodeId:'NODE-A001'};
  await assert.rejects(rotation.import(identity,'replacement-private-credential','e1','NODE-A001',async()=>({...scope,enrollmentId:'e2'}),async()=>{saved=true;}));assert.equal(saved,false);
  const result=await rotation.import(identity,'replacement-private-credential','e1','NODE-A001',async()=>scope,async()=>{saved=true;});assert.equal(saved,true);assert.equal(result.enrollmentId,'e1');assert.equal(result.credential,'replacement-private-credential');
});
