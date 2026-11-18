// Opt-in real broker measurement. Run with node --import tsx; never starts services.
import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {promisify} from 'node:util';

const benchmarkLimits = {concurrency: 8, repeat: 10};
const benchmarkDefaults = {concurrency: 3, repeat: 1};
const statsIntervalMs = 2000;
const executionNamespace = 'omnicompile-execution';
let saturationProbeActive = false;

function boundedOption(name, value) {
  const number = typeof value === 'string' && /^[1-9][0-9]*$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(number) || number < 1 || number > benchmarkLimits[name]) {
    throw new Error('--' + name + ' must be an integer from 1 to ' + benchmarkLimits[name] + '.');
  }
  return number;
}

export function configuration(args, env = process.env) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--run') options.run = true;
    else if (key === '--saturation') options.saturation = true;
    else if (key === '--kubernetes-stats') options.kubernetesStats = true;
    else if (['--url', '--token-file', '--concurrency', '--repeat'].includes(key) && args[i + 1] && !args[i + 1].startsWith('--')) options[key.slice(2)] = args[++i];
    else throw new Error('Expected --run --url <local broker URL> --token-file <credential file> [--concurrency 1-8] [--repeat 1-10] [--saturation] [--kubernetes-stats].');
  }
  if (!options.run) throw new Error('Real execution requires explicit --run.');
  const configured = options.url ?? env.OMNICOMPILE_EXECUTOR_URL;
  const tokenFile = options['token-file'] ?? env.OMNICOMPILE_EXECUTOR_TOKEN_FILE;
  if (!configured || !tokenFile) throw new Error('An explicit broker URL and token file are required.');
  const url = new URL(configured);
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Broker URL must be a localhost HTTP(S) origin without credentials.');
  return {url: url.origin, tokenFile, saturation: options.saturation === true,
    ...(options.kubernetesStats ? {kubernetesStats: true} : {}),
    concurrency: boundedOption('concurrency', options.concurrency ?? benchmarkDefaults.concurrency),
    repeat: boundedOption('repeat', options.repeat ?? benchmarkDefaults.repeat)};
}

export const workloads = [
  {language: 'c', sourceName: 'capacity.c', generatedSource: '#include <stdio.h>\nint main(void){long long s=0;for(int i=0;i<100000;i++)s+=i;printf("%lld\\n",s);return 0;}'},
  {language: 'python', sourceName: 'capacity.py', generatedSource: 'print(sum(range(100000)))\n'},
  {language: 'java', sourceName: 'Capacity.java', generatedSource: 'public class Capacity {public static void main(String[] args){long s=0;for(int i=0;i<100000;i++)s+=i;System.out.println(s);}}'}
];

export function aggregate(samples, wallMs) {
  const durations = samples.map(item => item.endToEndMs).sort((a, b) => a - b);
  const successful = samples.filter(item => item.ok).length;
  return {requests: samples.length, successful, failed: samples.length - successful, wallMs,
    requestsPerSecond: wallMs > 0 ? samples.length * 1000 / wallMs : null,
    successfulRequestsPerSecond: wallMs > 0 ? successful * 1000 / wallMs : null,
    meanEndToEndMs: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
    maxEndToEndMs: durations.at(-1) ?? null, samples};
}

export async function measureRequest(client, workload, {now = () => performance.now(), signal} = {}) {
  const started = now();
  let stage = 'compile';
  let compileRoundTripMs = null;
  try {
    const payload = {...workload};
    if (payload.language === 'java') {
      const compiled = await client.requestDockerJob({kind: 'task', language: 'java', payload: {operation: 'java_compile', sourceName: payload.sourceName, source: payload.generatedSource}}, signal);
      compileRoundTripMs = now() - started;
      if (!compiled.result?.artifactBase64 || !compiled.result?.fileName) throw new Error('Java compiler returned no artifact.');
      payload.artifactBase64 = compiled.result.artifactBase64;
      payload.artifactName = compiled.result.fileName;
    }
    stage = 'execute';
    const result = await client.requestDockerJob({kind: 'execute', language: payload.language, payload}, signal);
    const execution = result.execution;
    const outputMatches = execution?.stdout === '4999950000\n';
    const ok = execution?.status === 'SUCCEEDED' && outputMatches;
    return {language: payload.language, ok, endToEndMs: now() - started, executionStatus: execution?.status ?? null,
      compileRoundTripMs, executionDurationMs: execution?.durationMs ?? null, exitCode: execution?.exitCode ?? null,
      stdout: outputMatches ? execution.stdout : null, outputMatches};
  } catch (error) {
    const name = ['AbortError', 'TimeoutError', 'TypeError'].includes(error?.name) ? error.name : 'Error';
    const statusCode = error?.statusCode;
    return {language: workload.language, ok: false, endToEndMs: now() - started, stage, compileRoundTripMs,
      cancelled: signal?.aborted === true, error: {name, statusCode: Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599 ? statusCode : null}};
  }
}

export async function runSaturationProbe(client, {url, now = () => performance.now()} = {}) {
  if (saturationProbeActive) throw new Error('A saturation probe is already running.');
  const brokerJobsUrl = new URL('/jobs', url).href;
  const contenderWorkload = {...workloads[1], sourceName: 'capacity-probe-' + randomUUID() + '.py'};
  const contenderBody = JSON.stringify({kind: 'execute', language: 'python', payload: contenderWorkload});
  const blockerSleepSeconds = 3;
  const blockerWorkload = {...workloads[1], generatedSource: 'import time\ntime.sleep(' + blockerSleepSeconds + ')\n' + workloads[1].generatedSource};
  const blockerTimeoutMs = 90_000;
  const contenderTimeoutMs = 8_000;
  const contenderAbort = new AbortController();
  const originalFetch = globalThis.fetch;
  let pendingBlockers = 2;
  let capacityRejections = 0;

  saturationProbeActive = true;
  // Observe only the uniquely marked contender. The executor client retains ownership
  // of the response body and uses its ordinary capacity retry and cancellation path.
  globalThis.fetch = async (input, options) => {
    const response = await originalFetch(input, options);
    if (options?.method === 'POST' && options.body === contenderBody && String(input) === brokerJobsUrl &&
        response.status === 429 && pendingBlockers === 2 && !contenderAbort.signal.aborted) {
      if (++capacityRejections === 2) contenderAbort.abort();
    }
    return response;
  };

  const timer = setTimeout(() => contenderAbort.abort(new DOMException('Probe deadline elapsed.', 'TimeoutError')), contenderTimeoutMs);
  try {
    const blockerSignal = AbortSignal.timeout(blockerTimeoutMs);
    const blockerRequests = [1, 2].map(() =>
      measureRequest(client, blockerWorkload, {now, signal: blockerSignal}).finally(() => pendingBlockers--));
    const contender = await measureRequest(client, contenderWorkload, {now, signal: contenderAbort.signal});
    clearTimeout(timer);
    const blockers = await Promise.all(blockerRequests);
    const clientCancelled = contender.cancelled === true && contender.error?.name === 'AbortError';
    const observedCapacityRetry = capacityRejections === 2;
    let status = 'inconclusive';
    if (blockers.some(blocker => !blocker.ok)) status = 'failed';
    else if (observedCapacityRetry) status = clientCancelled ? 'passed' : 'failed';
    return {status, capacityRejections, observedCapacityRetry, clientCancelled,
      blockerSleepSeconds, blockerTimeoutMs, contenderTimeoutMs, blockers, contender};
  } finally {
    clearTimeout(timer);
    globalThis.fetch = originalFetch;
    saturationProbeActive = false;
  }
}

async function measureBatch(client, jobs, concurrency, now) {
  const samples = new Array(jobs.length);
  let next = 0;
  const started = now();
  async function measureNext() {
    while (next < jobs.length) {
      const index = next++;
      samples[index] = await measureRequest(client, jobs[index], {now});
    }
  }
  await Promise.all(Array.from({length: Math.min(concurrency, jobs.length)}, measureNext));
  return aggregate(samples, now() - started);
}


async function readNodeStats(signal) {
  const {stdout} = await promisify(execFile)('kubectl', [
    '--context', 'docker-desktop', 'get', '--raw',
    '/api/v1/nodes/desktop-control-plane/proxy/stats/summary'
  ], {timeout: 2000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, signal});
  return stdout;
}

function validSourceTimestamp(time) {
  if (typeof time !== 'string') return false;
  const parts = /^(\d{4})-(0[1-9]|1[0-2])-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(time);
  if (!parts) return false;
  const [year, month, day] = parts.slice(1).map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

function metric(stats, key) {
  const value = stats?.[key];
  if (!Number.isSafeInteger(value) || value < 0 || !validSourceTimestamp(stats?.time)) return null;
  return {time: stats.time, [key]: value};
}

function parseResourceStats(summary) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary) ||
      (!Object.hasOwn(summary, 'node') && !Array.isArray(summary.pods))) {
    throw new Error('Invalid stats summary');
  }
  const read = stats => ({
    cpu: metric(stats?.cpu, 'usageNanoCores'),
    memory: metric(stats?.memory, 'workingSetBytes')
  });
  const pods = Array.isArray(summary.pods) ? summary.pods : [];
  const containers = pods.filter(pod => pod?.podRef?.namespace === executionNamespace)
    .flatMap(pod => Array.isArray(pod.containers) ? Array.from(pod.containers, read) : []);
  return {node: read(summary.node), containers};
}

async function measureWithResourceStats(run, readStats, phase) {
  const controller = new AbortController();
  const samples = [];
  const validCounts = {nodeCpu: 0, nodeMemory: 0, containerCpu: 0, containerMemory: 0};
  const errors = {unavailable: 0, invalidSummary: 0, invalidReadings: 0};
  let measuring = true;
  let timer;
  let activeRead;

  function count(readings, cpuKey, memoryKey) {
    if (readings.cpu) validCounts[cpuKey]++;
    else errors.invalidReadings++;
    if (readings.memory) validCounts[memoryKey]++;
    else errors.invalidReadings++;
  }

  async function sample() {
    try {
      let raw;
      try {
        raw = await readStats(controller.signal);
      } catch {
        if (!controller.signal.aborted) errors.unavailable++;
        return;
      }
      let readings;
      try {
        readings = parseResourceStats(JSON.parse(raw));
      } catch {
        errors.invalidSummary++;
        return;
      }
      samples.push(readings);
      count(readings.node, 'nodeCpu', 'nodeMemory');
      for (const container of readings.containers) count(container, 'containerCpu', 'containerMemory');
    } finally {
      if (measuring) timer = setTimeout(startSample, statsIntervalMs);
    }
  }

  function startSample() {
    activeRead = sample();
  }

  startSample();
  try {
    return await run();
  } catch (error) {
    controller.abort();
    throw error;
  } finally {
    measuring = false;
    clearTimeout(timer);
    // A phase can drain a read it started before its workload ended.
    // The phase measurement finishes before this wait.
    await activeRead;
    Object.assign(phase, {samples, validCounts, errors});
  }
}

function peakNodeMetric(phases, resource, key) {
  let peak = null;
  for (const phase of Object.values(phases)) {
    for (const {node} of phase.samples) {
      if (node[resource]) peak = Math.max(peak ?? 0, node[resource][key]);
    }
  }
  return peak;
}


export async function runBenchmark(client, {
  now = () => performance.now(),
  concurrency = benchmarkDefaults.concurrency,
  repeat = benchmarkDefaults.repeat,
  saturation = false,
  kubernetesStats = false,
  readKubernetesStats = readNodeStats,
  url
} = {}) {
  const requestedConcurrency = boundedOption('concurrency', concurrency);
  const repetitions = boundedOption('repeat', repeat);
  const jobs = Array.from({length: repetitions}, () => workloads).flat();
  const phases = {};
  const runPhase = (name, run) => kubernetesStats ?
    measureWithResourceStats(run, readKubernetesStats, phases[name] = {}) : run();
  const sequential = await runPhase('sequential', () => measureBatch(client, jobs, 1, now));
  const effectiveConcurrency = Math.min(requestedConcurrency, jobs.length);
  const concurrent = await runPhase('concurrent', () => measureBatch(client, jobs, effectiveConcurrency, now));
  const saturationResult = saturation ? await runPhase('saturation', () => runSaturationProbe(client, {url, now})) : null;
  return {schemaVersion: 1, measuredAt: new Date().toISOString(), concurrency: requestedConcurrency, effectiveConcurrency,
    repeat: repetitions, sequential, concurrent,
    ...(saturationResult ? {saturation: saturationResult} : {}),
    ...(kubernetesStats ? {kubernetesStats: {
      source: 'Kubelet stats summary through kubectl on Docker Desktop',
      nodeScope: 'Node-wide (desktop-control-plane)',
      containerNamespace: executionNamespace,
      intervalAfterReadMs: statsIntervalMs,
      topLevelMetrics: 'Peak observed node-wide CPU in nanocores and memory working set in bytes',
      phases
    }} : {}),
    limitations: ['Throughput counts logical workloads per second. Java sends separate compile and execute requests.',
      'End-to-end and Java compile round-trip timings include transport and any admission retries.',
      'The job response provides program duration but omits broker execution IDs and Kubernetes stage timings.',
      'The configured logical concurrency does not establish broker saturation.',
      saturationResult ? 'The probe observes HTTP 429 responses while the blocker requests are pending. It does not identify the jobs occupying the broker slots or verify server-side cancellation.' :
        'Cancellation under saturation was not exercised.',
      kubernetesStats ? 'Kubernetes stats use asynchronous source timestamps. Node totals cover the whole node, and namespace samples may miss short-lived containers. An in-flight read may finish after its phase workload without affecting phase timing.' :
        'CPU and RAM usage were not measured.'],
    cpuUsage: peakNodeMetric(phases, 'cpu', 'usageNanoCores'),
    memoryUsageBytes: peakNodeMetric(phases, 'memory', 'workingSetBytes')};
}

export async function main(args = process.argv.slice(2)) {
  const config = configuration(args);
  const token = (await readFile(config.tokenFile, 'utf8')).trim();
  if (token.length < 32) throw new Error('Invalid broker credential file.');
  process.env.OMNICOMPILE_EXECUTOR_URL = config.url;
  process.env.OMNICOMPILE_EXECUTOR_TOKEN_FILE = resolve(config.tokenFile);
  const client = await import('../packages/orchestration/src/docker-executor-client.ts');
  const report = await runBenchmark(client, config);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (report.sequential.failed || report.concurrent.failed || (report.saturation && report.saturation.status !== 'passed')) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    // Never print credentials, transport URLs, or server diagnostics.
    process.stderr.write('Capacity measurement failed. Check the local broker, credential file and tsx loader. Usage: --run --url <local broker URL> --token-file <credential file> [--concurrency 1-8] [--repeat 1-10] [--saturation] [--kubernetes-stats].\n');
    process.exitCode = 1;
  });
}
