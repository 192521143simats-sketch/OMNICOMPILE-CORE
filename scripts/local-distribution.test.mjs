import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {localDistributionManifest,publishContainerDistribution} from './Local-Distribution.mjs';
test('local package metadata uses actual bytes and configured versions; missing packages fail',async()=>{
 const root=await mkdtemp(join(tmpdir(),'omnicompile-package-metadata-'));
 try{
  const files=[['apps/windows-worker/package.json','{"version":"1.2.3"}'],['apps/android-worker/app/build.gradle.kts','versionName = "2.3.4"'],['.runtime/windows-worker/releases/OMNICOMPILE-Worker-1.2.3-Windows-x64-Setup.exe','unit fixture windows bytes'],['apps/android-worker/app/build/outputs/apk/debug/app-debug.apk','unit fixture android bytes']];
  for(const[path,bytes]of files){await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),bytes);}
  const manifest=await localDistributionManifest(root);assert.equal(manifest[1].version,'2.3.4');assert.equal(manifest[1].sha256,createHash('sha256').update(files[3][1]).digest('hex'));assert.equal(manifest[1].sizeBytes,Buffer.byteLength(files[3][1]));assert.ok(manifest.every(entry=>!('url' in entry)));
  await rm(join(root,files[3][0]));await assert.rejects(localDistributionManifest(root),/ENOENT/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('container publisher copies only existing package bytes and uses container-safe paths',async()=>{
 const root=await mkdtemp(join(tmpdir(),'omnicompile-container-distribution-'));
 try{
  const windowsBytes=Buffer.from('explicit unit fixture Windows installer bytes');
  const files=[['apps/windows-worker/package.json','{"version":"1.2.3"}'],['apps/android-worker/app/build.gradle.kts','versionName = "2.3.4"'],['.runtime/windows-worker/releases/OMNICOMPILE-Worker-1.2.3-Windows-x64-Setup.exe',windowsBytes]];
  for(const[path,bytes]of files){await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),bytes);}
  await assert.rejects(localDistributionManifest(root),/ENOENT/);
  const entries=await publishContainerDistribution(root);assert.equal(entries.length,1);assert.equal(entries[0].platform,'WINDOWS');
  assert.equal(entries[0].filePath,'/app/.runtime/distribution/OMNICOMPILE-Worker-1.2.3-Windows-x64-Setup.exe');
  assert.deepEqual(await readFile(join(root,'.runtime/distribution',entries[0].fileName)),windowsBytes);
  assert.equal(entries[0].sha256,createHash('sha256').update(windowsBytes).digest('hex'));
  assert.deepEqual(JSON.parse(await readFile(join(root,'.runtime/distribution/manifest.json'),'utf8')),entries);
  await assert.rejects(readFile(join(root,'.runtime/distribution/OMNICOMPILE-Worker-2.3.4-Android-debug.apk')),/ENOENT/);
  await rm(join(root,files[2][0]));assert.deepEqual(await publishContainerDistribution(root),[]);
  assert.deepEqual(JSON.parse(await readFile(join(root,'.runtime/distribution/manifest.json'),'utf8')),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('container publisher rejects empty packages rather than advertising placeholders',async()=>{
 const root=await mkdtemp(join(tmpdir(),'omnicompile-empty-package-'));
 try{
  for(const[path,bytes]of [['apps/windows-worker/package.json','{"version":"1.2.3"}'],['apps/android-worker/app/build.gradle.kts','versionName = "2.3.4"'],['.runtime/windows-worker/releases/OMNICOMPILE-Worker-1.2.3-Windows-x64-Setup.exe','']]){await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),bytes);}
  await assert.rejects(publishContainerDistribution(root),/Empty WINDOWS package/);
 }finally{await rm(root,{recursive:true,force:true});}
});
