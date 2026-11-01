import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as names from './Windows-Install-Fixture.mjs';
test('renamed worker recognition protects old and new installed products but not unrelated applications',()=>{
  assert.ok(names.workerProductPattern instanceof RegExp);
  for(const value of ['GRID-X Worker','GRID-X Worker 0.1.0','OmniCompile Core Worker','OmniCompile Core Worker 0.1.1'])assert.equal(names.workerProductPattern.test(value),true);
  for(const value of ['Other Worker','OmniCompile Core Worker Fake','GRID-X Worker stolen'])assert.equal(names.workerProductPattern.test(value),false);
  assert.equal(names.workerUninstallerPattern.test('Uninstall OmniCompile Core Worker.exe'),true);
  assert.equal(names.workerUninstallerPattern.test('Uninstall GRID-X Worker.exe'),true);
  assert.equal(names.workerUninstallerPattern.test('Uninstall Other.exe'),false);
});
