import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

for(const configured of [true,false])test(`startup starts tools without enrolling workers; legacy metadata: ${configured}`,{skip:process.platform!=='win32'},async()=>{
 const fixture=await mkdtemp(join(tmpdir(),'omnicompile-startup-'));
 const startup=resolve('infra/docker/operations/Start-Containers.ps1');
 try{
  await mkdir(join(fixture,'bin'));
  await mkdir(join(fixture,'.runtime/docker/cloud-workers'),{recursive:true});
  if(configured)await writeFile(join(fixture,'.runtime/docker/cloud-workers/enrollment.json'),'{}');
  await writeFile(join(fixture,'.env'),'MYSQL_ROOT_PASSWORD=fixture-only\nDB_PORT=3307\nDB_NAME=omnicompile\n');
  await writeFile(join(fixture,'bin','node.ps1'),`param([Parameter(ValueFromRemainingArguments=$true)]$Items)
if ($Items[0] -like '*Provision-Cloud-Workers.mjs') {
 [IO.File]::WriteAllText((Join-Path $env:FIXTURE_ROOT 'provisioned'), 'yes')
 foreach ($lang in @('c','python','java')) { [IO.File]::WriteAllText((Join-Path $env:FIXTURE_ROOT ('.runtime/docker/cloud-workers/'+$lang+'.credential')), 'new-fixture-credential') }
}
$global:LASTEXITCODE=0
`);
  await writeFile(join(fixture,'run.ps1'),`param($Startup,$Root)
$ErrorActionPreference='Stop'
$env:FIXTURE_ROOT=$Root
$env:PATH=(Join-Path $Root 'bin')+';'+$env:PATH
function global:docker {
 $items=@($args);$global:LASTEXITCODE=0
 [IO.File]::AppendAllText((Join-Path $env:FIXTURE_ROOT 'calls'),($items -join ' ')+[Environment]::NewLine)
 if ($items[0] -eq 'inspect') { 'healthy'; return }
 if ($items[0] -eq 'container') { 'fixture-backend'; return }
 if ($items -contains 'up' -and $items -contains '--wait') {
  $workerWait=($items -contains 'omnicompile-c-worker') -or $items[-1] -eq '240'
  # Tool readiness is independent of worker credentials.
 }
}
function global:Invoke-RestMethod { @{status='ready'} }
function global:Invoke-WebRequest { @{StatusCode=200} }
& $Startup -ProjectRoot $Root -SkipBuild
`);
  const run=spawnSync('pwsh',['-NoProfile','-File',join(fixture,'run.ps1'),startup,fixture],{encoding:'utf8',timeout:20000,windowsHide:true});
  assert.equal(run.status,0,run.stdout+run.stderr);
  const calls=(await readFile(join(fixture,'calls'),'utf8')).split(/\r?\n/).filter(Boolean);
  const starts=calls.filter(line=>line.includes(' up '));
  assert.equal(starts.length,2,'core services and tool providers must start without creating a network');
  assert.ok(!starts[0].includes('omnicompile-c-worker'));
  assert.equal(starts.slice(1).some(line=>line.includes('omnicompile-c-worker')),true);
  await assert.rejects(readFile(join(fixture,'provisioned')),'startup must never provision cloud nodes');
 }finally{await rm(fixture,{recursive:true,force:true});}
});
