import test from 'node:test';
import assert from 'node:assert/strict';
import {configuration, aggregate, measureRequest, runBenchmark, runSaturationProbe, workloads} from './Measure-Execution-Capacity.mjs';

test('explicit opt-in, URL and token file required; only local origins accepted', () => {
  assert.throws(() => configuration([], {}));
  assert.throws(() => configuration(['--run'], {}));
  for (const url of ['https://example.com', 'http://localhost@evil.test', 'http://localhost/path', 'file:///tmp/test', 'http://localhost/?token=secret']) {
    assert.throws(() => configuration(['--run', '--url', url, '--token-file', 'secret'], {}));
  }
  assert.deepEqual(configuration(['--run'], {OMNICOMPILE_EXECUTOR_URL: 'http://127.0.0.1:4100', OMNICOMPILE_EXECUTOR_TOKEN_FILE: 'secret'}), {url: 'http://127.0.0.1:4100', tokenFile: 'secret', saturation: false, concurrency: 3, repeat: 1});
});

test('aggregation includes failed latency and counts successful throughput', () => {
  const summary = aggregate([{ok: true, endToEndMs: 30}, {ok: false, endToEndMs: 10}], 100);
  assert.equal(summary.successfulRequestsPerSecond, 10);
  assert.equal(summary.requestsPerSecond, 20);
  assert.equal(summary.meanEndToEndMs, 20);
  assert.equal(summary.failed, 1);
  assert.equal(aggregate([], 0).meanEndToEndMs, null);
});

test('Java compilation supplies real returned artifact to execution', async () => {
  const calls = [];
  const client = {async requestDockerJob(job) {
    calls.push(job);
    return job.kind === 'task' ? {result: {artifactBase64: 'amFy', fileName: 'Capacity.jar'}} : {execution: {status: 'SUCCEEDED', stdout: '4999950000\n', durationMs: 4, exitCode: 0}};
  }};
  let time = 5;
  const result = await measureRequest(client, workloads[2], {now: () => time += 10});
  assert.equal(result.ok, true);
  assert.equal(result.endToEndMs, 20);
  assert.equal(result.compileRoundTripMs, 10);
  assert.equal(result.executionDurationMs, 4);
  assert.equal(result.stdout, '4999950000\n');
  assert.equal(result.exitCode, 0);
  assert.equal(calls[1].payload.artifactBase64, 'amFy');
  assert.equal(calls[0].payload.operation, 'java_compile');
});

test('failures, unexpected output and caller cancellation remain failures', async () => {
  const controller = new AbortController(); controller.abort();
  const failure = await measureRequest({requestDockerJob: async () => {throw Object.assign(new Error('secret'), {name: 'broker-secret-name', code: 'broker-secret-code'});}}, workloads[0], {signal: controller.signal});
  assert.equal(failure.cancelled, true);
  assert.equal(failure.error.name, 'Error');
  assert.ok(!JSON.stringify(failure).includes('secret'));
  const mismatch = await measureRequest({requestDockerJob: async () => ({execution: {status: 'SUCCEEDED', stdout: 'broker-secret-token'}})}, workloads[1]);
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.outputMatches, false);
  assert.equal(mismatch.stdout, null);
  assert.ok(!JSON.stringify(mismatch).includes('broker-secret-token'));
});

test('baseline is sequential then three logical workloads overlap; no resource claims', async () => {
  let active = 0, peak = 0;
  const report = await runBenchmark({async requestDockerJob(job) {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    return job.kind === 'task' ? {result: {artifactBase64: 'amFy', fileName: 'Capacity.jar'}} : {execution: {status: 'SUCCEEDED', stdout: '4999950000\n'}};
  }});
  assert.equal(peak, 3);
  assert.equal(report.sequential.successful, 3);
  assert.equal(report.concurrent.successful, 3);
  assert.equal(report.cpuUsage, null);
  assert.equal(report.memoryUsageBytes, null);
});

test('CLI validates bounded positive integer concurrency and repeat options', () => {
  const args = ['--run', '--url', 'http://localhost:4102', '--token-file', 'secret'];
  const config = configuration([...args, '--concurrency', '8', '--repeat', '10'], {});
  assert.equal(config.concurrency, 8);
  assert.equal(config.repeat, 10);
  for (const flag of ['--concurrency', '--repeat']) {
    for (const value of ['0', '-1', '1.5', '1e1', 'Infinity', '11']) {
      assert.throws(() => configuration([...args, flag, value], {}), new RegExp(flag));
    }
  }
});

test('configured repeats preserve workload order and bound logical concurrency', async () => {
  const batches = [[], []];
  let phase = 0;
  let active = 0;
  const peaks = [0, 0];
  let completed = 0;
  const report = await runBenchmark({async requestDockerJob(job) {
    const batch = phase;
    batches[batch].push([job.kind, job.language]);
    active++;
    peaks[batch] = Math.max(peaks[batch], active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    if (job.kind === 'task') return {result: {artifactBase64: 'amFy', fileName: 'Capacity.jar'}};
    if (++completed === 6) phase++;
    return {execution: {status: 'SUCCEEDED', stdout: '4999950000\n'}};
  }}, {concurrency: 2, repeat: 2});
  const expectedLanguages = ['c', 'python', 'java', 'c', 'python', 'java'];
  assert.deepEqual(peaks, [1, 2]);
  assert.deepEqual(batches.map(batch => batch.filter(([kind]) => kind === 'task').length), [2, 2]);
  assert.deepEqual(report.sequential.samples.map(sample => sample.language), expectedLanguages);
  assert.deepEqual(report.concurrent.samples.map(sample => sample.language), expectedLanguages);
  assert.equal(report.concurrency, 2);
  assert.equal(report.repeat, 2);
});

test('programmatic options are validated before requests are dispatched', async () => {
  const client = {requestDockerJob() { assert.fail('Unexpected broker request'); }};
  await assert.rejects(runBenchmark(client, {concurrency: 9}), /--concurrency/);
  await assert.rejects(runBenchmark(client, {repeat: Infinity}), /--repeat/);
});
test('saturation requires explicit opt-in and the default report omits the probe', async () => {
  const args = ['--run', '--url', 'http://localhost:4102', '--token-file', 'secret'];
  assert.equal(configuration(args, {}).saturation, false);
  assert.equal(configuration([...args, '--saturation'], {}).saturation, true);
  const report = await runBenchmark({async requestDockerJob(job) {
    return job.kind === 'task' ? {result: {artifactBase64: 'amFy', fileName: 'Capacity.jar'}} : {execution: {status: 'SUCCEEDED', stdout: '4999950000\n'}};
  }});
  assert.equal(Object.hasOwn(report, 'saturation'), false);
});

function saturationFixture(t, {contenderAccepted = false, blockerOutput = '4999950000\n'} = {}) {
  const brokerUrl = 'http://localhost:4102';
  const jobsUrl = new URL('/jobs', brokerUrl);
  const blockerOutputResult = {execution: {status: 'SUCCEEDED', stdout: blockerOutput}};
  const calls = [];
  const attempts = [];
  const blockers = [];
  let signal;
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    attempts.push({url, options});
    return new Response('withheld', {status: 429});
  });
  const client = {async requestDockerJob(job, requestSignal) {
    calls.push(job);
    if (calls.length < 3) return new Promise(resolve => blockers.push(resolve));
    signal = requestSignal;
    try {
      if (contenderAccepted) return blockerOutputResult;
      const options = {method: 'POST', body: JSON.stringify(job)};
      const wrongMethod = await globalThis.fetch(jobsUrl, {...options, method: 'GET'});
      const wrongUrl = await globalThis.fetch(new URL('/elsewhere', brokerUrl), options);
      const wrongBody = await globalThis.fetch(jobsUrl, {...options, body: JSON.stringify(calls[0])});
      for (const response of [wrongMethod, wrongUrl, wrongBody]) assert.equal(await response.text(), 'withheld');
      const first = await globalThis.fetch(jobsUrl, options);
      assert.equal(await first.text(), 'withheld');
      signal.throwIfAborted();
      const retry = await globalThis.fetch(jobsUrl, options);
      assert.equal(await retry.text(), 'withheld');
      signal.throwIfAborted();
      assert.fail('Contender should be aborted after the retry receives 429');
    } finally {
      blockers.forEach(resolve => resolve(blockerOutputResult));
    }
  }};
  return {brokerUrl, client, calls, attempts, fetch, get signal() {return signal;}};
}

test('saturation aborts a retried contender while both Python blockers are pending', async t => {
  const fixture = saturationFixture(t);
  const result = await runSaturationProbe(fixture.client, {url: fixture.brokerUrl});
  assert.equal(fixture.calls.length, 3);
  assert.ok(fixture.calls.slice(0, 2).every(job => job.language === 'python' && job.payload.generatedSource.includes('time.sleep(')));
  assert.equal(fixture.signal.aborted, true);
  assert.equal(fixture.attempts.length, 5);
  assert.equal(result.status, 'passed');
  assert.equal(result.capacityRejections, 2);
  assert.equal(result.contender.error.name, 'AbortError');
  assert.deepEqual(result.blockers.map(blocker => blocker.ok), [true, true]);
  assert.equal(globalThis.fetch, fixture.fetch);
});

test('saturation remains inconclusive when the contender is admitted', async t => {
  const fixture = saturationFixture(t, {contenderAccepted: true});
  const result = await runSaturationProbe(fixture.client, {url: fixture.brokerUrl});
  assert.equal(result.status, 'inconclusive');
  assert.equal(result.capacityRejections, 0);
  assert.equal(result.contender.ok, true);
  assert.equal(globalThis.fetch, fixture.fetch);
});

test('saturation fails when a blocker returns unexpected output', async t => {
  const fixture = saturationFixture(t, {blockerOutput: 'secret'});
  const result = await runSaturationProbe(fixture.client, {url: fixture.brokerUrl});
  assert.equal(result.status, 'failed');
  assert.equal(result.contender.error.name, 'AbortError');
  assert.ok(!JSON.stringify(result).includes('secret'));
});

test('overlapping saturation probes preserve the active probe transport', async t => {
  const fixture = saturationFixture(t);
  const first = runSaturationProbe(fixture.client, {url: fixture.brokerUrl});
  const observedFetch = globalThis.fetch;
  const second = runSaturationProbe({requestDockerJob() {assert.fail('Overlapping dispatch');}}, {url: fixture.brokerUrl});
  assert.equal(globalThis.fetch, observedFetch);
  await assert.rejects(second, /already running/);
  assert.equal((await first).status, 'passed');
  assert.equal(globalThis.fetch, fixture.fetch);
});
