import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';

test('maintained project files and paths consistently use the current identity',()=>{
  // Git metadata, third-party dependencies and ignored generated archives are
  // deliberately outside this maintained-source assertion.
  const patterns=[['grid','x'].join('[-_]?'),['c',['opti','forge'].join('')].join('[-_]?')];
  const retired=new RegExp(patterns.join('|'),'i');
  const names=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0');
  const failures=[];
  for(const name of new Set(names)){
    if(!name||!existsSync(name))continue;
    const bytes=readFileSync(name);
    if(bytes.includes(0))continue;
    if(retired.test(name)||retired.test(bytes.toString('utf8')))failures.push(name);
  }
  assert.deepEqual(failures,[],`Retired identity in maintained files: ${failures.join(', ')}`);
});
