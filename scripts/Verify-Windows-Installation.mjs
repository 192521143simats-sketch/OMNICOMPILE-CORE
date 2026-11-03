import {expect} from '@playwright/test';import {_electron} from 'playwright';import {access,readFile,readdir} from 'node:fs/promises';import {resolve,join,sep} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {assertIsolatedTarget,verifyIsolatedCoordinator} from './Integration-Target.mjs';import {workerUninstallerPattern,installedWorkers,runFixtureInstaller,installFixtureWithCleanup,closeFixtureApplication} from './Windows-Install-Fixture.mjs';
const target=assertIsolatedTarget();await verifyIsolatedCoordinator(target);const exec=promisify(execFile),evidence=resolve(process.env.OMNICOMPILE_TEST_EVIDENCE),directory=join(evidence,'installed-worker'),oldSetup=resolve('.runtime/windows-worker/releases/baseline/OMNICOMPILE-Worker-0.1.0-Windows-x64-Setup.exe'),newSetup=resolve('.runtime/windows-worker/releases/OMNICOMPILE-Worker-0.1.1-Windows-x64-Setup.exe');
if(!directory.toLowerCase().startsWith((evidence+sep).toLowerCase()))throw new Error('Unsafe install target');if((await installedWorkers()).length)throw new Error('An existing OMNICOMPILE Worker is installed; preserving it.');try{await access(directory);throw new Error('Fixture install path already exists; preserving it.');}catch(error){if(error.code!=='ENOENT')throw error;}
const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',"@((Join-Path ([Environment]::GetFolderPath('Desktop')) 'OMNICOMPILE Worker.lnk'),(Join-Path ([Environment]::GetFolderPath('Programs')) 'OMNICOMPILE Worker.lnk'),(Join-Path ([Environment]::GetFolderPath('Desktop')) 'OmniCompile Core Worker.lnk'),(Join-Path ([Environment]::GetFolderPath('Programs')) 'OmniCompile Core Worker.lnk')) | ForEach-Object {Test-Path -LiteralPath $_} | ConvertTo-Json -Compress"],{windowsHide:true,timeout:10000});if(JSON.parse(stdout).some(Boolean))throw new Error('Existing OMNICOMPILE shortcuts found; preserving them.');
await access(oldSetup);await access(newSetup);let installed=false;
async function uninstall(){
  const entries=await installedWorkers();
  if(entries.length){expect(entries).toHaveLength(1);expect(resolve(entries[0].InstallLocation)).toBe(directory);}
  let files;try{files=await readdir(directory);}catch(error){if(error.code==='ENOENT'&&!entries.length)return;throw error;}
  const file=files.find(name=>workerUninstallerPattern.test(name));
  if(!file){if(!files.length&&!entries.length)return;throw new Error('Owned uninstaller missing; preserving partial installation for investigation.');}
  await exec(join(directory,file),['/S',`_?=${directory}`],{windowsHide:true,windowsVerbatimArguments:true,timeout:120000});
  await expect.poll(async()=>{try{await access(join(directory,'OMNICOMPILE Worker.exe'));return true;}catch{return false;}},{timeout:30000}).toBe(false);expect(await installedWorkers()).toHaveLength(0);
  const shortcuts=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',"@((Join-Path ([Environment]::GetFolderPath('Desktop')) 'OMNICOMPILE Worker.lnk'),(Join-Path ([Environment]::GetFolderPath('Programs')) 'OMNICOMPILE Worker.lnk'),(Join-Path ([Environment]::GetFolderPath('Desktop')) 'OmniCompile Core Worker.lnk'),(Join-Path ([Environment]::GetFolderPath('Programs')) 'OmniCompile Core Worker.lnk')) | ForEach-Object {Test-Path -LiteralPath $_} | ConvertTo-Json -Compress"],{windowsHide:true,timeout:10000});expect(JSON.parse(shortcuts.stdout).some(Boolean)).toBe(false);
  console.log('Owned uninstaller removed application, shortcuts and per-user registration without deleting protected configuration.');
}
try{
  await installFixtureWithCleanup(()=>runFixtureInstaller(oldSetup,directory),uninstall);installed=true;const entries=await installedWorkers();expect(entries).toHaveLength(1);expect(resolve(entries[0].InstallLocation)).toBe(directory);await access(join(directory,'OMNICOMPILE Worker.exe'));
  process.env.OMNICOMPILE_WINDOWS_EXECUTABLE=join(directory,'OMNICOMPILE Worker.exe');process.env.OMNICOMPILE_WINDOWS_UPGRADE_SETUP=newSetup;
  await import('./Verify-Windows-Worker.mjs');
  const identity=await readFile(join(evidence,'windows-profile/identity.json'),'utf8');expect(identity).not.toContain('workerCredential');
  console.log('Local per-user NSIS install and 0.1.0 → 0.1.1 upgrade passed; encrypted identity and node identity survived. This developer host is not a clean VM.');
  await uninstall();installed=false;
  await installFixtureWithCleanup(()=>runFixtureInstaller(newSetup,directory),uninstall);installed=true;
  const entriesAfterReinstall=await installedWorkers();expect(entriesAfterReinstall).toHaveLength(1);expect(resolve(entriesAfterReinstall[0].InstallLocation)).toBe(directory);
  let reinstalled;
  try{
    reinstalled=await _electron.launch({executablePath:join(directory,'OMNICOMPILE Worker.exe'),env:{...process.env,OMNICOMPILE_WORKER_DATA_DIR:join(evidence,'windows-profile')},timeout:30000});
    const window=await reinstalled.firstWindow();await expect(window.locator('#status')).toHaveText('DISCONNECTED');
    const state=await window.evaluate(()=>window.omnicompile.snapshot());expect(state.hasEnrollment).toBe(false);expect(state.settings.maxMemoryMB).toBe(1024);expect(state.settings.maxTaskDurationSeconds).toBe(120);expect(state.settings.allowNative).toBe(true);expect(state.currentTask).toBe(null);expect(state.error).toBe('');
    expect(await readFile(join(evidence,'windows-profile/identity.json'),'utf8')).toBe(identity);
    console.log('Actual reinstall preserved encrypted settings and the cleared-after-leave enrollment state, without automatically starting contribution.');
  }finally{if(reinstalled)await closeFixtureApplication(reinstalled);}
}finally{
  if(installed)await uninstall();
}
