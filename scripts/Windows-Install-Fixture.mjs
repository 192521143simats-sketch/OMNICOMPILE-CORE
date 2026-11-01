import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {resolve,sep} from 'node:path';import {assertIsolatedTarget} from './Integration-Target.mjs';
import {terminateOwnedTestProcess} from './Owned-Test-Process.mjs';
const exec=promisify(execFile);
export const workerProductPattern=/^(?:GRID-X|OmniCompile Core) Worker(?: [0-9].*)?$/i;
export const workerUninstallerPattern=/^Uninstall (?:GRID-X|OmniCompile Core) Worker\.exe$/i;
export async function runFixtureInstaller(setup,directory){assertIsolatedTarget();const evidence=resolve(process.env.GRID_X_TEST_EVIDENCE),target=resolve(directory),artifact=resolve(setup),releases=resolve('.runtime/windows-worker/releases');if(!target.toLowerCase().startsWith((evidence+sep).toLowerCase())||!artifact.toLowerCase().startsWith((releases+sep).toLowerCase())||!/GRID-X-Worker-[\w.-]+-Windows-x64-Setup\.exe$/i.test(artifact))throw new Error('Refusing non-owned installation fixture.');await exec(artifact,['/S',`/D=${target}`],{windowsHide:true,windowsVerbatimArguments:true,timeout:180000,maxBuffer:1024*1024});}
export async function installedWorkers(){const{stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',`ConvertTo-Json -Compress -InputObject @(Get-ItemProperty 'HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match '${workerProductPattern.source}' } | Select-Object DisplayName,InstallLocation,UninstallString)`],{windowsHide:true,timeout:10000});return(stdout.trim()?JSON.parse(stdout):[]).map(entry=>({...entry,InstallLocation:entry.InstallLocation||entry.UninstallString?.match(/^\"(.+)[\\/]Uninstall (?:GRID-X|OmniCompile Core) Worker\.exe\"/)?.[1]}));}
export async function installFixtureWithCleanup(install,cleanup){
  try{await install();}catch(error){try{await cleanup();}catch(cleanupError){throw new AggregateError([error,cleanupError],'Installation failed and owned cleanup could not be confirmed.');}throw error;}
}
export async function closeFixtureApplication(application,deadlineMs=20000){
  const owned=application.process();let timer;
  try{await Promise.race([application.close(),new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Desktop close deadline exceeded.')),deadlineMs);})]);}
  finally{clearTimeout(timer);await terminateOwnedTestProcess(owned);}
}
