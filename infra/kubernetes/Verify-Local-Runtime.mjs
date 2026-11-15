import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {executionManifest} from '../../apps/coordinator/src/kubernetes-execution.ts';

const [context, runtimeClass] = process.argv.slice(2);
if (!/^(docker-desktop|kind-[a-z0-9-]+)$/.test(context ?? '') ||
    !/^[a-z0-9][a-z0-9.-]{0,62}$/.test(runtimeClass ?? '')) {
  throw new Error('Specify an explicit local context and RuntimeClass.');
}

function kubectl(args, input) {
  return execFileSync('kubectl', ['--context', context, '--request-timeout=10s', ...args], {
    input, encoding: 'utf8', windowsHide: true, timeout: 15_000, maxBuffer: 64_000
  });
}

const executionNamespace = ['-n', 'omnicompile-execution'];
const config = JSON.parse(kubectl(['config', 'view', '--minify', '-o', 'json']));
const server = new URL(config.clusters[0].cluster.server);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(server.hostname)) {
  throw new Error('The runtime probe requires a loopback Kubernetes API endpoint.');
}
const runtime = JSON.parse(kubectl(['get', 'runtimeclass', runtimeClass, '-o', 'json']));
const images = JSON.parse(kubectl(['-n', 'omnicompile', 'get', 'configmap', 'execution-images', '-o', 'json'])).data;
if (kubectl([...executionNamespace, 'get', 'jobs', '-o', 'name']).trim()) {
  throw new Error('Wait for the local execution namespace to become idle.');
}

async function verify(language, image) {
  const job = executionManifest(randomUUID(), image ?? '', runtimeClass, 1);
  const name = job.metadata.name.replace('omni-', 'runtime-probe-');
  job.metadata = {name, labels: {'omnicompile.io/runtime-probe': language}};
  job.spec.activeDeadlineSeconds = 45;
  job.spec.template.metadata.labels = job.metadata.labels;
  const pod = job.spec.template.spec;
  pod.volumes = pod.volumes.filter(volume => volume.name === 'tmp');
  const [runner] = pod.containers;
  runner.command = ['/usr/local/bin/omnicompile-compiler-sandbox', '/usr/bin/true'];
  runner.env = [{name: 'TMPDIR', value: '/tmp'}];
  runner.volumeMounts = runner.volumeMounts.filter(volume => volume.name === 'tmp');

  try {
    kubectl([...executionNamespace, 'create', '-f', '-'], JSON.stringify(job));
    const deadline = performance.now() + 52_000;
    while (performance.now() < deadline) {
      const state = JSON.parse(kubectl([...executionNamespace, 'get', 'job', name, '-o', 'json']));
      if (state.status?.conditions?.some(condition => condition.type === 'Complete' && condition.status === 'True')) {
        console.log(JSON.stringify({language, image, runtimeClass, handler: runtime.handler, status: 'passed'}));
        return;
      }
      const failed = state.status?.conditions?.find(condition => condition.type === 'Failed' && condition.status === 'True');
      if (failed) {
        let logs = '';
        try { logs = kubectl([...executionNamespace, 'logs', 'job/' + name, '--tail=10']).trim(); }
        catch { /* The runner may have failed to start. */ }
        throw new Error(`${language} wrapper probe failed (${failed.reason ?? 'Job failed'}). ${logs}`);
      }
      await delay(750);
    }
    throw new Error(`${language} wrapper probe did not complete before the deadline.`);
  } finally {
    kubectl([...executionNamespace, 'delete', 'job', name, '--ignore-not-found', '--cascade=foreground', '--timeout=10s']);
  }
}

for (const language of ['c', 'python', 'java']) {
  await verify(language, images?.[language]);
}
