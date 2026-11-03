import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

test('environment initialization preserves hash-only authentication and existing credentials',{skip:process.platform!=='win32'},()=>{
  const root=mkdtempSync(join(tmpdir(),'omnicompile-environment-'));
  try{
    const file=join(root,'.env'),original='NODE_ENV=production\nADMIN_USERNAME=owner\nADMIN_PASSWORD_HASH=$argon2id$existing-value\nDB_PASSWORD=preserved\n';
    writeFileSync(file,original);
    const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',resolve('scripts/Initialize-Environment.ps1'),'-ProjectRoot',root],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const contents=readFileSync(file,'utf8');
    assert.ok(contents.startsWith(original));assert.doesNotMatch(contents,/^ADMIN_PASSWORD=/m);
    assert.match(contents,/^SESSION_TTL_HOURS=12/m);
    const repeated=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',resolve('scripts/Initialize-Environment.ps1'),'-ProjectRoot',root],{encoding:'utf8'});
    assert.equal(repeated.status,0,repeated.stderr);assert.equal(readFileSync(file,'utf8'),contents);
  }finally{rmSync(root,{recursive:true,force:true});}
});
