// Render only: no kubectl, network access, credentials or deployment side effects.
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {executionManifest} from '../apps/coordinator/src/kubernetes-manifests.ts';

const namePattern=/^[a-z0-9](?:[a-z0-9.-]{0,61}[a-z0-9])?$/;
export function renderRuntimeProbes({runtimeClass,images,pullSecret}={}){
  if(!namePattern.test(runtimeClass??''))throw new Error('An explicit reviewed sandbox RuntimeClass is required.');
  if(pullSecret!==undefined&&!namePattern.test(pullSecret))throw new Error('Invalid registry pull Secret name.');
  const items=['c','python','java'].map(language=>{
    const image=images?.[language];
    if(typeof image!=='string'||!/^ghcr\.io\/[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/.test(image))throw new Error(`A digest-pinned GHCR image is required for ${language}.`);
    const job=executionManifest(randomUUID(),image,runtimeClass,1);
    const labels={'omnicompile.io/runtime-probe':language};
    job.metadata={name:`omni-probe-${language}-${randomUUID().slice(0,8)}`,namespace:'omnicompile-execution',labels};
    job.spec.activeDeadlineSeconds=45;
    job.spec.template.metadata.labels=labels;
    const pod=job.spec.template.spec,runner=pod.containers[0];
    pod.nodeSelector={'kubernetes.io/arch':'arm64'};
    if(pullSecret)pod.imagePullSecrets=[{name:pullSecret}];
    pod.volumes=pod.volumes.filter(volume=>volume.name==='tmp');
    runner.volumeMounts=runner.volumeMounts.filter(volume=>volume.name==='tmp');
    runner.command=['/usr/local/bin/omnicompile-compiler-sandbox','/usr/bin/true'];
    runner.env=[{name:'TMPDIR',value:'/tmp'}];
    return job;
  });
  return {apiVersion:'v1',kind:'List',items};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const [runtimeClass,publicationFile,pullSecret,...extra]=process.argv.slice(2);
  if(!runtimeClass||!publicationFile||extra.length)throw new Error('Usage: node scripts/Render-Arm64-Runtime-Probes.mjs REVIEWED_RUNTIME ARM64_PUBLICATION_JSON [PULL_SECRET]');
  const publication=JSON.parse(readFileSync(publicationFile,'utf8'));
  if(publication.status!=='passed'||!Array.isArray(publication.images))throw new Error('A passing image publication record is required.');
  const images={};
  for(const language of ['c','python','java']){
    const matches=publication.images.filter(item=>typeof item.pullReference==='string'&&item.pullReference.includes(`/omnicompile-${language}-worker@`));
    if(matches.length!==1||!matches[0].pullReference.endsWith('@'+matches[0].digest))throw new Error(`Exactly one consistent publication digest is required for ${language}.`);
    images[language]=matches[0].pullReference;
  }
  console.log(JSON.stringify(renderRuntimeProbes({runtimeClass,images,pullSecret}),null,2));
}
