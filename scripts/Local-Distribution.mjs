import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

/** Metadata from actual local packages, never an invented published URL. */
export async function localDistributionManifest(root=process.cwd(),{allowMissing=false}={}) {
  const windows=JSON.parse(await readFile(resolve(root,'apps/windows-worker/package.json'),'utf8'));
  if(typeof windows.version!=='string'||!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(windows.version))throw new Error('Windows package version unavailable');
  const gradle=await readFile(resolve(root,'apps/android-worker/app/build.gradle.kts'),'utf8');
  const androidVersion=gradle.match(/versionName\s*=\s*"(\d+\.\d+\.\d+)"/)?.[1];
  if(!androidVersion)throw new Error('Android package version unavailable');
  const entries=[
    {platform:'WINDOWS',version:windows.version,fileName:`OMNICOMPILE-Worker-${windows.version}-Windows-x64-Setup.exe`,filePath:resolve(root,`.runtime/windows-worker/releases/OMNICOMPILE-Worker-${windows.version}-Windows-x64-Setup.exe`),trust:'UNSIGNED_DEVELOPMENT'},
    {platform:'ANDROID',version:androidVersion,fileName:`OMNICOMPILE-Worker-${androidVersion}-Android-debug.apk`,filePath:resolve(root,'apps/android-worker/app/build/outputs/apk/debug/app-debug.apk'),trust:'DEBUG_BUILD'}
  ];
  const available=[];
  for(const entry of entries){
    let bytes;try{bytes=await readFile(entry.filePath);}catch(error){if(allowMissing&&error.code==='ENOENT')continue;throw error;}
    if(bytes.length===0)throw new Error(`Empty ${entry.platform} package is not distributable`);
    entry.sha256=createHash('sha256').update(bytes).digest('hex');entry.sizeBytes=bytes.length;available.push(entry);
  }
  return available;
}

/** Publish only actual packages into the directory mounted read-only by Docker. */
export async function publishContainerDistribution(root=process.cwd()) {
  const destination=resolve(root,'.runtime/docker/distribution');await mkdir(destination,{recursive:true});
  const entries=await localDistributionManifest(root,{allowMissing:true}),published=[];
  for(const entry of entries){
    const bytes=await readFile(entry.filePath);
    if(bytes.length!==entry.sizeBytes||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw new Error(`Changed ${entry.platform} package; retry after packaging completes`);
    await writeFile(resolve(destination,entry.fileName),bytes);
    published.push({...entry,filePath:`/app/.runtime/distribution/${entry.fileName}`});
  }
  await writeFile(resolve(destination,'manifest.json'),JSON.stringify(published,null,2));
  return published;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const destination=resolve('.runtime/docker/distribution/manifest.json');await mkdir(dirname(destination),{recursive:true});
  if(process.argv.includes('--container')){
    const entries=await publishContainerDistribution();
    console.log(`Container prerelease distribution prepared: ${entries.length} actual package(s); missing platforms remain unavailable.`);
  }else{
    await writeFile(destination,JSON.stringify(await localDistributionManifest(),null,2));
    console.log(`Verified local prerelease manifest: ${destination}\nPowerShell: $env:OMNICOMPILE_LOCAL_DISTRIBUTION_MANIFEST=Get-Content -Raw '${destination}'`);
  }
}
