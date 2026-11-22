import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {renderRuntimeProbes} from './Render-Arm64-Runtime-Probes.mjs';

const digest='a'.repeat(64);
const images=Object.fromEntries(['c','python','java'].map(language=>[language,`ghcr.io/example/omnicompile-${language}@sha256:${digest}`]));
test('renders three bounded ARM64 probes using the mandatory sandbox and no privileged access',()=>{
  const result=renderRuntimeProbes({runtimeClass:'reviewed-sandbox',images});
  assert.equal(result.kind,'List');
  assert.equal(result.items.length,3);
  for(const job of result.items){
    assert.equal(job.metadata.namespace,'omnicompile-execution');
    assert.equal(job.spec.activeDeadlineSeconds,45);
    assert.equal(job.spec.backoffLimit,0);
    const pod=job.spec.template.spec, runner=pod.containers[0];
    assert.deepEqual(pod.nodeSelector,{'kubernetes.io/arch':'arm64'});
    assert.equal(pod.runtimeClassName,'reviewed-sandbox');
    assert.equal(pod.automountServiceAccountToken,false);
    assert.equal(pod.securityContext.runAsNonRoot,true);
    assert.equal(runner.securityContext.readOnlyRootFilesystem,true);
    assert.equal(runner.securityContext.allowPrivilegeEscalation,false);
    assert.deepEqual(runner.securityContext.capabilities.drop,['ALL']);
    assert.deepEqual(runner.command,['/usr/local/bin/omnicompile-compiler-sandbox','/usr/bin/true']);
    assert.deepEqual(runner.env,[{name:'TMPDIR',value:'/tmp'}]);
    assert.deepEqual(pod.volumes,[{name:'tmp',emptyDir:{medium:'Memory',sizeLimit:'128Mi'}}]);
    assert.deepEqual(runner.volumeMounts,[{name:'tmp',mountPath:'/tmp'}]);
    assert.equal(runner.resources.limits.memory,'512Mi');
    assert.equal(runner.resources.limits['ephemeral-storage'],'256Mi');
  }
});
test('rejects missing runtimes, missing images, mutable tags and unexpected registries before rendering',()=>{
  for(const options of [{images},{images,runtimeClass:'bad/name'},{runtimeClass:'reviewed',images:{...images,java:undefined}},{runtimeClass:'reviewed',images:{...images,c:'ghcr.io/example/image:latest'}},{runtimeClass:'reviewed',images:{...images,c:`evil.test/image@sha256:${digest}`}}])assert.throws(()=>renderRuntimeProbes(options));
});
test('supports a namespaced read-only registry pull secret without embedding credentials',()=>{
  const result=renderRuntimeProbes({runtimeClass:'reviewed',images,pullSecret:'registry-read'});
  assert.deepEqual(result.items[0].spec.template.spec.imagePullSecrets,[{name:'registry-read'}]);
  assert.throws(()=>renderRuntimeProbes({runtimeClass:'reviewed',images,pullSecret:'secret/token'}));
});
test('each rendering uses unique names and never shares an execution workspace',()=>{
  const a=renderRuntimeProbes({runtimeClass:'reviewed',images}),b=renderRuntimeProbes({runtimeClass:'reviewed',images});
  assert.equal(new Set([...a.items,...b.items].map(job=>job.metadata.name)).size,6);
});
test('CLI fails closed on missing arguments without invoking deployment tools',()=>{
  const child=spawnSync(process.execPath,['scripts/Render-Arm64-Runtime-Probes.mjs'],{encoding:'utf8'});
  assert.notEqual(child.status,0);
  assert.equal(child.stdout,'');
  assert.match(child.stderr,/runtime/i);
});
test('CLI renders a consistent publication and rejects failed or duplicate publication records',()=>{
  const directory=mkdtempSync(join(tmpdir(),'omnicompile-probe-render-'));
  const file=join(directory,'publication.json');
  const records=['c','python','java'].map(language=>({digest:`sha256:${digest}`,pullReference:`ghcr.io/example/omnicompile-${language}-worker@sha256:${digest}`}));
  try{
    for(const record of [{status:'passed',images:records},{status:'failed',images:records},{status:'passed',images:[...records,records[0]]},{status:'passed',images:[{...records[0],digest:`sha256:${'b'.repeat(64)}`},...records.slice(1)]}]){
      writeFileSync(file,JSON.stringify(record));
      const result=spawnSync(process.execPath,['scripts/Render-Arm64-Runtime-Probes.mjs','reviewed',file],{encoding:'utf8'});
      if(record.status==='passed'&&record.images===records){assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).items.length,3);}
      else{assert.notEqual(result.status,0);assert.equal(result.stdout,'');}
    }
  }finally{rmSync(directory,{recursive:true,force:true});}
});
