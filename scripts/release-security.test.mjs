import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyArchive, releaseAsset} from './Install-Release-Scanner.mjs';
import {sanitizeReport, assertScannerResult, imageCommands,summarizeScan} from './Verify-Release-Security.mjs';

test('installer rejects altered downloads and unsupported platforms', () => {
  const bytes=Buffer.from('authentic fixture');
  const digest=createHash('sha256').update(bytes).digest('hex');
  assert.doesNotThrow(()=>verifyArchive(bytes,digest));
  assert.throws(()=>verifyArchive(Buffer.from('tampered'),digest),/checksum/i);
  assert.throws(()=>releaseAsset('linux','arm64'),/unsupported/i);
  assert.match(releaseAsset('linux','x64').sha256,/^[a-f0-9]{64}$/);
});
test('scanner errors, missing reports and malformed reports cannot pass', () => {
  assert.throws(()=>assertScannerResult({status:2},{}),/scanner/i);
  assert.throws(()=>assertScannerResult({status:null,error:new Error('missing')},{}),/scanner/i);
  assert.throws(()=>assertScannerResult({status:0},{}),/report/i);
  assert.throws(()=>assertScannerResult({status:0},{SchemaVersion:2,Results:'invalid'}),/report/i);
  assert.doesNotThrow(()=>assertScannerResult({status:0},{SchemaVersion:2,Results:[]}));
});
test('secret matches and source text never reach retained evidence', () => {
  const report={SchemaVersion:2,Results:[{Target:'source.js',Secrets:[{RuleID:'key',Severity:'HIGH',StartLine:3,EndLine:3,Match:'sensitive-value',Code:{Lines:[{Content:'sensitive-value'}]}}]}]};
  const safe=sanitizeReport(report,'source');
  assert.equal(safe.findings.length,1);
  assert.equal(safe.findings[0].rule,'key');
  assert.ok(!JSON.stringify(safe).includes('sensitive-value'));
  assert.equal(safe.status,'failed');
});
test('nonzero finding exit cannot produce passed evidence even with empty findings',()=>{
  assert.equal(summarizeScan({status:1},{SchemaVersion:2,Results:[]},'source').status,'failed');
});
test('clean Trivy filesystem report may omit Results when artifact metadata is present',()=>{
  const report={SchemaVersion:2,CreatedAt:'2026-11-20T00:00:00Z',ArtifactName:'/tmp/source',ArtifactType:'filesystem',Metadata:{}};
  assert.deepEqual(summarizeScan({status:0},report,'source').findings,[]);
  assert.equal(summarizeScan({status:0},report,'source').status,'passed');
});
test('omitted Results without artifact metadata and explicit malformed Results fail closed',()=>{
  for(const report of [{SchemaVersion:2},{SchemaVersion:2,ArtifactName:'',ArtifactType:'filesystem'},{SchemaVersion:2,ArtifactName:'source',ArtifactType:'unknown'},{SchemaVersion:2,ArtifactName:'source',ArtifactType:'filesystem',Results:null},{SchemaVersion:2,ArtifactName:'source',ArtifactType:'filesystem',Results:'invalid'}]){
    assert.throws(()=>summarizeScan({status:0},report,'source'),/report/i);
  }
});
test('image vulnerability and SBOM commands bind to same immutable image ID', () => {
  const id='sha256:'+'a'.repeat(64);
  const commands=imageCommands(id,'findings.json','sbom.json');
  assert.ok(commands.every(args=>args.at(-1)===id));
  assert.ok(commands[0].includes('HIGH,CRITICAL'));
  assert.ok(commands[0].includes('--exit-code'));
  assert.ok(commands[1].includes('cyclonedx'));
  assert.throws(()=>imageCommands('mutable:tag','a','b'),/immutable/i);
});
