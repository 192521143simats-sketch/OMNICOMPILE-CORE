import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {configuredArtifactStorage} from './artifact-storage.js';

// Operator-only acceptance entry point. It is never registered as an HTTP route.
const mode=process.argv[2];
if(!['--roundtrip','--write-persistence-marker','--verify-and-remove-marker'].includes(mode??''))throw new Error('Choose an explicit artifact storage verification mode');
const identifier=mode==='--verify-and-remove-marker'?process.argv[3]:randomBytes(16).toString('hex');
if(!identifier||! /^[a-f0-9]{32}$/.test(identifier))throw new Error('Invalid owned storage fixture identifier');
const storage=configuredArtifactStorage();
if(!storage)throw new Error('Artifact object storage must be explicitly configured');
const key=storage.objectKey(`STORAGE-VERIFY-${identifier}`,`ARTIFACT-${identifier}`);
const bytes=Buffer.from(`OmniCompile durable artifact fixture ${identifier}`);
const digest=createHash('sha256').update(bytes).digest('hex');
let retain=false;
try{
  await storage.initialize();
  if(mode!=='--verify-and-remove-marker')await storage.put(key,bytes,'application/octet-stream');
  assert.deepEqual(await storage.get(key,bytes.length,digest),bytes);
  if(mode==='--write-persistence-marker'){
    retain=true;
    console.log(JSON.stringify({fixture:identifier,writtenAndVerified:true}));
  }else if(mode==='--roundtrip'){
    const anonymous=await fetch(new URL(`/${storage.bucket}/${key}`,process.env.OMNICOMPILE_ARTIFACT_ENDPOINT),{signal:AbortSignal.timeout(5000)});
    await anonymous.body?.cancel();
    assert.ok([401,403,404].includes(anonymous.status),'Anonymous access to a private artifact was not rejected');
    await storage.put(key,Buffer.from('Modified fixture bytes'),'application/octet-stream');
    await assert.rejects(storage.get(key,bytes.length,digest),/Artifact integrity verification failed/);
    await storage.remove(key);
    await assert.rejects(storage.get(key,bytes.length,digest),/stored artifact is unavailable/);
    console.log(JSON.stringify({fixture:identifier,writeReadIntegrity:true,anonymousAccessRejected:true,tamperingRejected:true,missingObjectRejected:true}));
  }else console.log(JSON.stringify({fixture:identifier,persistenceAfterRestart:true}));
}finally{
  if(!retain)await storage.remove(key);
  storage.close();
}
