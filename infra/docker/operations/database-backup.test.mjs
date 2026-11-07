import {test} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {backupPath,restoreDatabase} from './Database-Backup.mjs';

test('database backups remain in the project backup directory',()=>{
  assert.equal(backupPath(process.cwd(),'snapshot.sql'),join(process.cwd(),'.runtime','backups','snapshot.sql'));
  for(const input of ['../snapshot.sql','C:/snapshot.sql','/snapshot.sql','.env','backup.sql\n']){
    assert.throws(()=>backupPath(process.cwd(),input));
  }
});

test('restore accepts only explicitly isolated project clone names',()=>{
  assert.equal(restoreDatabase('omnicompile_restore_0123456789abcdef'),'omnicompile_restore_0123456789abcdef');
  for(const name of ['omnicompile','mysql','other_project','omnicompile_restore_x','omnicompile_restore_0123456789abcdef;DROP DATABASE mysql']){
    assert.throws(()=>restoreDatabase(name));
  }
});
