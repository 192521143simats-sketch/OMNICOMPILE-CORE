import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
const source=(await readFile(new URL('./Verify-Remediated-Images.mjs',import.meta.url),'utf8')).replaceAll('\r\n','\n');
const start=source.indexOf('   // Includes nested acceptance containers');
const end=source.indexOf('\n }\n for(const file',start);
assert.ok(start>0&&end>start);
const cleanup=new Function('docker','id','label','assert','failures',source.slice(start,end));

test('container shell entrypoints retain Unix line endings on Windows',async()=>{
 for(const name of ['artifact-service/entrypoint.sh','coordinator/coordinator-entrypoint.sh','frontend/15-omnicompile-dns.envsh']){
  const script=await readFile(new URL(`../images/${name}`,import.meta.url),'utf8');
  assert.ok(script.startsWith('#!/bin/sh\n'),`${name}: invalid executable shebang`);
  assert.ok(!script.includes('\r'),`${name}: CRLF breaks Linux shell execution`);
 }
});
test('outer fixture cleanup scopes selectors and verifies ownership before deleting',()=>{
 const id='a'.repeat(16),calls=[],failures=[];
 const docker=args=>{
  calls.push(args);
  if(args[0]==='ps'){
   assert.equal(args[3],args[3].includes('execution.instance')?`label=omnicompile.execution.instance=${id}`:`label=omnicompile.regression=${id}`);
   return args[3].includes('execution.instance')?'owned-job':'owned-service\nforeign-service';
  }
  if(args[0]==='inspect')return args.at(-1)==='foreign-service'?'b'.repeat(16):id;
  if(args[0]==='network'&&args[1]==='ls'){assert.equal(args[3],`label=omnicompile.regression=${id}`);return 'owned-network\nforeign-network';}
  if(args[0]==='network'&&args[1]==='inspect')return args.at(-1)==='foreign-network'?'b'.repeat(16):id;
  return '';
 };
 cleanup(docker,id,`omnicompile.regression=${id}`,assert,failures);
 assert.deepEqual(calls.filter(args=>args[0]==='rm').map(args=>args.at(-1)).sort(),['owned-job','owned-service']);
 assert.deepEqual(calls.filter(args=>args[0]==='network'&&args[1]==='rm').map(args=>args.at(-1)),['owned-network']);
 assert.equal(failures.length,2);
});
