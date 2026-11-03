import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,access,unlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawn} from 'node:child_process';
import {installFixtureWithCleanup,closeFixtureApplication} from './Windows-Install-Fixture.mjs';
import {terminateOwnedTestProcess} from './Owned-Test-Process.mjs';

test('installer failure after writing its target still removes the owned fixture',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'omnicompile-install-failure-')),marker=join(directory,'owned-installation');
  try{await assert.rejects(installFixtureWithCleanup(async()=>{await writeFile(marker,'owned installer output');throw new Error('Installer failed after write');},()=>unlink(marker)),/Installer failed after write/);await assert.rejects(access(marker),{code:'ENOENT'});}finally{await rm(directory,{recursive:true,force:true});}
});
test('failed installer cleanup preserves both errors for investigation',async()=>{
  await assert.rejects(installFixtureWithCleanup(async()=>{throw new Error('Installer failure');},async()=>{throw new Error('Owned cleanup failure');}),error=>error instanceof AggregateError&&error.errors.map(value=>value.message).join('|')==='Installer failure|Owned cleanup failure');
});
test('a hung desktop close has a deadline and terminates the retained owned process',{timeout:10000},async()=>{
  const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});
  try{await assert.rejects(closeFixtureApplication({process:()=>child,close:()=>new Promise(()=>{})},50),/close.*deadline/i);assert.ok(child.exitCode!==null||child.signalCode!==null);}finally{await terminateOwnedTestProcess(child);}
});
