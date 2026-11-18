import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createHash, randomUUID, randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {terminateOwnedTestProcess} from './Owned-Test-Process.mjs';

export function parseArguments(args) {
  assert.equal(args.length, 5, 'Required: --run --context docker-desktop --base http://127.0.0.1:15173');
  assert.equal(args[0], '--run', 'Explicit --run opt-in required');
  assert.equal(args[1], '--context'); assert.equal(args[2], 'docker-desktop');
  assert.equal(args[3], '--base');
  const url = new URL(args[4]);
  assert(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && url.port === '15173' && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password, 'Expected loopback frontend port 15173');
  return {context: args[2], base: 'http://127.0.0.1:15173'};
}

export function validateCluster(config, nodes) {
  assert.equal(config['current-context'], 'docker-desktop', 'Unexpected Kubernetes context');
  assert.equal(config.contexts?.length, 1); assert.equal(config.clusters?.length, 1);
  assert.equal(config.contexts[0].name, 'docker-desktop');
  assert.equal(config.contexts[0].context.cluster, config.clusters[0].name);
  const server = new URL(config.clusters[0].cluster.server);
  assert(server.protocol === 'https:' && ['127.0.0.1', 'localhost', '[::1]'].includes(server.hostname) && !server.username && !server.password, 'Kubernetes API must be loopback HTTPS');
  assert(nodes.items?.length > 0, 'Cluster has no nodes');
  assert(nodes.items.every(node => node.status?.conditions?.some(condition => condition.type === 'Ready' && condition.status === 'True')), 'All nodes must be Ready');
}

export function artifactUrl(base, path) {
  assert(typeof path === 'string' && /^\/api\/artifacts\/[A-Za-z0-9_-]+\/download$/.test(path), 'Unexpected artifact download path');
  const url = new URL(path, base); assert.equal(url.origin, base); return url.href;
}

export async function assertForwardPortAvailable() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', () => reject(new Error('Port 15173 is occupied; refusing HTTP writes')));
    server.listen({host: '127.0.0.1', port: 15173, exclusive: true}, resolve);
  });
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

export function waitForForward(child, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let output = '';
    const finish = error => {
      clearTimeout(timer); child.off('error', failed); child.off('exit', exited);
      child.stdout?.off('data', data); child.stderr?.off('data', data);
      error ? reject(error) : resolve();
    };
    const failed = () => finish(new Error('Owned Kubernetes port-forward failed'));
    const exited = () => finish(new Error('Owned Kubernetes port-forward exited before readiness'));
    const data = chunk => {
      output = (output + chunk.toString()).slice(-4096);
      if (output.includes('Forwarding from 127.0.0.1:15173 -> 8080')) {
        child.exitCode === null && child.signalCode === null ? finish() : exited();
      }
    };
    const timer = setTimeout(() => finish(new Error('Owned Kubernetes port-forward startup timed out')), timeoutMs);
    child.on('error', failed); child.on('exit', exited); child.stdout?.on('data', data); child.stderr?.on('data', data);
    if (child.exitCode !== null || child.signalCode !== null) exited();
  });
}

export async function main(args, dependencies = {}) {
  const target = parseArguments(args);
  const kubectl = dependencies.kubectl ?? (args => JSON.parse(execFileSync('kubectl', ['--context', target.context, '--request-timeout=10s', ...args], {encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 1000000})));
  validateCluster(await kubectl(['config', 'view', '--minify', '-o', 'json']), await kubectl(['get', 'nodes', '-o', 'json']));
  await (dependencies.assertPortAvailable ?? assertForwardPortAvailable)();
  const forward = (dependencies.spawn ?? spawn)('kubectl', ['--context', target.context, '-n', 'omnicompile', 'port-forward', '--address', '127.0.0.1', 'svc/omnicompile-frontend', '15173:8080'], {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
  let forwardFailed = false;
  const markForwardFailed = () => { forwardFailed = true; };
  forward.on('error', markForwardFailed); forward.on('exit', markForwardFailed);
  try {
  await waitForForward(forward, dependencies.forwardTimeoutMs ?? 20000);
  const request = dependencies.fetch ?? fetch, log = dependencies.log ?? console.log;
  let cookie = '';
  async function http(path, {body, anonymous = false, binary = false} = {}) {
    assert(!forwardFailed && forward.exitCode === null && forward.signalCode === null, 'Owned Kubernetes port-forward is no longer running');
    const url = path.startsWith('/api/artifacts/') ? artifactUrl(target.base, path) : target.base + path;
    const response = await request(url, {method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(15000), headers: {origin: target.base, ...(!anonymous && cookie ? {cookie} : {}), ...(body ? {'content-type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
    if (!anonymous && response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';', 1)[0];
    const bytes = Buffer.from(await response.arrayBuffer());
    return {status: response.status, bytes, value: binary ? undefined : JSON.parse(bytes.toString())};
  }
  const identity = randomUUID(), email = `kube-${identity}@example.test`, password = randomBytes(24).toString('base64url') + '!aA9';
  assert.equal((await http('/api/auth/signup', {body: {name: 'Local Kubernetes acceptance', email, password, confirmPassword: password}})).status, 201, 'Fresh user signup failed');
  assert.equal((await http('/api/auth/login', {body: {identifier: email, password}})).status, 200, 'Fresh user login failed');
  const results = [];
  for (const sample of [
    {language: 'c', sourceName: 'Receipt.c', source: '#include <stdio.h>\nint main(void){int value;if(scanf("%d",&value)!=1)return 2;printf("%d\\n",value+1);return 0;}'},
    {language: 'python', sourceName: 'receipt.py', source: 'print(int(input())+1)\n'},
    {language: 'java', sourceName: 'Receipt.java', source: 'public class Receipt {public static void main(String[] args){System.out.println(new java.util.Scanner(System.in).nextInt()+1);}}'}
  ]) {
    const submitted = await http('/api/compilations', {body: {...sample, executionInput: '41\n', executionMode: 'CLOUD_ONLY'}});
    assert.equal(submitted.status, 202, `${sample.language}: cloud submission failed`);
    assert.match(submitted.value.id, /^[A-Za-z0-9_-]+$/);
    let job;
    const deadline = Date.now() + 180000;
    do {
      const detail = await http(`/api/compilations/${submitted.value.id}`); assert.equal(detail.status, 200); job = detail.value;
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status)) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    } while (Date.now() < deadline);
    assert.equal(job.status, 'COMPLETED', `${sample.language}: compilation did not complete successfully`);
    assert.equal(job.executionMode, 'CLOUD_ONLY'); assert.deepEqual(job.executionLocations, ['CLOUD']);
    assert(job.artifacts?.length > 0, 'Artifacts missing');
    let report;
    const artifacts = [];
    for (const artifact of job.artifacts) {
      const download = await http(artifact.downloadUrl, {binary: true}); assert.equal(download.status, 200);
      assert.equal(download.bytes.length, artifact.sizeBytes); assert(download.bytes.length > 0);
      const digest = createHash('sha256').update(download.bytes).digest('hex');
      const repeat = await http(artifact.downloadUrl, {binary: true}); assert.equal(repeat.status, 200);
      assert.equal(createHash('sha256').update(repeat.bytes).digest('hex'), digest, 'Repeated artifact content changed');
      assert.equal((await http(artifact.downloadUrl, {anonymous: true, binary: true})).status, 401, 'Anonymous artifact access was allowed');
      if (artifact.artifactType === 'BUILD_REPORT_JSON') report = JSON.parse(download.bytes.toString());
      artifacts.push({type: artifact.artifactType, sizeBytes: download.bytes.length, sha256: digest});
    }
    assert(report, 'JSON build report missing'); assert.equal(report.programExecution.status, 'SUCCEEDED');
    assert.equal(report.programExecution.output, '42\n'); assert.equal(report.programExecution.exitCode, 0);
    assert(report.programExecution.executionTimeSeconds > 0, 'Execution timing missing');
    results.push({language: sample.language, jobId: job.id, artifacts});
    log(`${sample.language}: real cloud compilation/execution, output, artifact bytes/hash stability and anonymous rejection passed`);
  }
  const limitations = ['Owner compilation API exposes executionLocations but no task kind/capability: C_COMPILE/PYTHON_COMPILE/JAVA_COMPILE attribution requires separate admin evidence.', 'CLOUD placement alone does not prove the execution provider or broker database state; separate Kubernetes Job/receipt evidence is required.', 'Artifact hashes are measured and checked across two downloads; owner artifact metadata has no expected digest.', 'No admin UI, cancellation, broker restart, receipt replay, prewarm expiry/drain or network isolation acceptance is performed. Fresh user and job data are retained.'];
  for (const limitation of limitations) log(`Coverage limit: ${limitation}`);
  return {results, limitations};
  } finally {
    // A spawn error can occur before Windows creates a process/PID.
    if (dependencies.terminate || Number.isSafeInteger(forward.pid)) await (dependencies.terminate ?? terminateOwnedTestProcess)(forward);
    forward.off('error', markForwardFailed); forward.off('exit', markForwardFailed);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(() => { console.error('Local Kubernetes compiler acceptance failed; no existing data was deleted. Check cluster readiness, cloud workers and API contracts.'); process.exitCode = 1; });
}
