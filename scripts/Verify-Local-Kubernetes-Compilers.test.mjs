import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {parseArguments, validateCluster, artifactUrl, main, waitForForward} from './Verify-Local-Kubernetes-Compilers.mjs';

const args = ['--run', '--context', 'docker-desktop', '--base', 'http://127.0.0.1:15173'];
const config = {'current-context': 'docker-desktop', contexts: [{name: 'docker-desktop', context: {cluster: 'desktop'}}], clusters: [{name: 'desktop', cluster: {server: 'https://127.0.0.1:6443'}}]};
const nodes = {items: [{status: {conditions: [{type: 'Ready', status: 'True'}]}}]};
test('requires exact explicit local opt-in and frontend origin', () => {
  assert.equal(parseArguments(args).base, 'http://127.0.0.1:15173');
  for (const values of [[], args.slice(1), args.map(v => v === 'docker-desktop' ? 'production' : v), ...['http://example.test:15173', 'http://127.0.0.1:4100', 'http://user:password@127.0.0.1:15173', 'http://127.0.0.1:15173/?token=x'].map(base => [...args.slice(0, 4), base])]) assert.throws(() => parseArguments(values));
});
test('requires loopback API, exact context and every node ready', () => {
  validateCluster(config, nodes);
  for (const server of ['https://cluster.example.test', 'http://127.0.0.1:6443']) assert.throws(() => validateCluster({...config, clusters: [{name: 'desktop', cluster: {server}}]}, nodes));
  assert.throws(() => validateCluster({...config, 'current-context': 'production'}, nodes));
  assert.throws(() => validateCluster(config, {items: []}));
  assert.throws(() => validateCluster(config, {items: [...nodes.items, {status: {conditions: []}}]}));
});
test('artifact path guard prevents credential forwarding outside owner API', () => {
  assert.equal(artifactUrl('http://127.0.0.1:15173', '/api/artifacts/ART-123/download'), 'http://127.0.0.1:15173/api/artifacts/ART-123/download');
  for (const path of ['https://example.test/a', '//example.test/a', '/api/artifacts/../download', '/api/artifacts/abc/download?token=x']) assert.throws(() => artifactUrl('http://127.0.0.1:15173', path));
});
test('failed cluster guard prevents all HTTP requests and writes', async () => {
  let requests = 0;
  await assert.rejects(main(args, {kubectl: async values => values[0] === 'config' ? config : {items: []}, fetch: async () => {requests++; throw new Error('Unexpected HTTP');}}));
  assert.equal(requests, 0);
});

function fakeForward() {
  return Object.assign(new EventEmitter(), {exitCode: null, signalCode: null, stdout: new PassThrough(), stderr: new PassThrough()});
}
const readyCluster = async values => values[0] === 'config' ? config : nodes;
test('occupied port rejects before spawning or HTTP access', async () => {
  let calls = 0;
  await assert.rejects(main(args, {kubectl: readyCluster, assertPortAvailable: async () => {throw new Error('occupied');}, spawn: () => {calls++;}, fetch: () => {calls++;}}), /occupied/);
  assert.equal(calls, 0);
});
test('owned forward startup failure prevents HTTP and cleans up only that child', async () => {
  const child = fakeForward(); let requests = 0; const cleaned = [];
  await assert.rejects(main(args, {kubectl: readyCluster, assertPortAvailable: async () => {}, spawn: () => {setImmediate(() => {child.exitCode = 1; child.emit('exit', 1);}); return child;}, terminate: async value => {cleaned.push(value);}, fetch: () => {requests++;}}), /before readiness/);
  assert.equal(requests, 0); assert.deepEqual(cleaned, [child]);
});
test('HTTP failure terminates owned forward after exact forwarding readiness', async () => {
  const child = fakeForward(); let requests = 0; const cleaned = [];
  await assert.rejects(main(args, {kubectl: readyCluster, assertPortAvailable: async () => {}, spawn: (executable, values, options) => {
    assert.equal(executable, 'kubectl'); assert.deepEqual(values, ['--context', 'docker-desktop', '-n', 'omnicompile', 'port-forward', '--address', '127.0.0.1', 'svc/omnicompile-frontend', '15173:8080']); assert.equal(options.windowsHide, true);
    setImmediate(() => child.stdout.write('Forwarding from 127.0.0.1:15173 -> 8080\n')); return child;
  }, terminate: async value => {cleaned.push(value);}, fetch: async () => {requests++; throw new Error('fixture HTTP failure');}}), /fixture HTTP failure/);
  assert.equal(requests, 1); assert.deepEqual(cleaned, [child]);
});
test('startup requires exact forwarding event and has a bounded timeout', async () => {
  const child = fakeForward();
  const waiting = waitForForward(child, 15);
  child.stdout.write('Forwarding from 127.0.0.1:9999 -> 8080\n');
  await assert.rejects(waiting, /timed out/);
  assert.equal(child.listenerCount('exit'), 0); assert.equal(child.listenerCount('error'), 0);
});
