import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('retains granular source obligations, evidence on regeneration, and rejects changed source identities',()=>{
  const root=mkdtempSync(join(tmpdir(),'omnicompile-ledger-')),folder=join(root,'docs/engineering/specification'),script=resolve('scripts/Generate-Requirement-Ledger.mjs');
  try{
    mkdirSync(folder,{recursive:true});
    const source='## M1. Order\nRead every requirement.\n\nBEGIN SOURCE A\n# 1. Platform\n- Never erase records.\nBEGIN SOURCE B\n## 1. Platform\n- Verify workers.\n';
    writeFileSync(join(folder,'MASTER_PROMPT.txt'),source);
    const run=()=>spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8'});
    assert.equal(run().status,0);
    const path=join(root,'docs/engineering/REQUIREMENT_LEDGER.json'),ledger=JSON.parse(readFileSync(path,'utf8'));
    assert.deepEqual(ledger.items.map(item=>item.id),['M:M1:L1','M:M1:L2','A:preamble:L4','A:1:L5','A:1:L6','B:preamble:L7','B:1:L8','B:1:L9']);
    assert.equal(ledger.sourceLineCount,9);
    ledger.items[4].status='VERIFIED';ledger.items[4].evidence=['test-proof.md'];ledger.currentProduct='OmniCompile Core';ledger.additionalRequirements=[{id:'approved-override',status:'IN_PROGRESS'}];writeFileSync(path,JSON.stringify(ledger));
    assert.equal(run().status,0);
    assert.deepEqual(JSON.parse(readFileSync(path,'utf8')).items[4].evidence,['test-proof.md']);
    assert.equal(JSON.parse(readFileSync(path,'utf8')).currentProduct,'OmniCompile Core');
    assert.deepEqual(JSON.parse(readFileSync(path,'utf8')).additionalRequirements,[{id:'approved-override',status:'IN_PROGRESS'}]);
    writeFileSync(join(folder,'MASTER_PROMPT.txt'),source.replace('Never erase records.','Erase all records.'));
    const changed=run();assert.notEqual(changed.status,0);assert.match(changed.stderr,/Source changed/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
