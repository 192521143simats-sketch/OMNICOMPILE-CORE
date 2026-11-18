// Opt-in real broker measurement. Run with node --import tsx; never starts services.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const benchmarkLimits = {concurrency: 8, repeat: 10};
const benchmarkDefaults = {concurrency: 3, repeat: 1};

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
    else if (['--url', '--token-file', '--concurrency', '--repeat'].includes(key) && args[i + 1] && !args[i + 1].startsWith('--')) options[key.slice(2)] = args[++i];
    else throw new Error('Expected --run --url <local broker URL> --token-file <credential file> [--concurrency 1-8] [--repeat 1-10].');
  }
  if (!options.run) throw new Error('Real execution requires explicit --run.');
  const configured = options.url ?? env.OMNICOMPILE_EXECUTOR_URL;
  const tokenFile = options['token-file'] ?? env.OMNICOMPILE_EXECUTOR_TOKEN_FILE;
  if (!configured || !tokenFile) throw new Error('An explicit broker URL and token file are required.');
  const url = new URL(configured);
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Broker URL must be a localhost HTTP(S) origin without credentials.');
  return {url: url.origin, tokenFile,
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

export async function runBenchmark(client, {
  now = () => performance.now(),
  concurrency = benchmarkDefaults.concurrency,
  repeat = benchmarkDefaults.repeat
} = {}) {
  const requestedConcurrency = boundedOption('concurrency', concurrency);
  const repetitions = boundedOption('repeat', repeat);
  const jobs = Array.from({length: repetitions}, () => workloads).flat();
  const sequential = await measureBatch(client, jobs, 1, now);
  const effectiveConcurrency = Math.min(requestedConcurrency, jobs.length);
  const concurrent = await measureBatch(client, jobs, effectiveConcurrency, now);
  return {schemaVersion: 1, measuredAt: new Date().toISOString(), concurrency: requestedConcurrency, effectiveConcurrency,
    repeat: repetitions, sequential, concurrent,
    limitations: ['Throughput counts logical workloads per second. Java sends separate compile and execute requests.',
      'End-to-end and Java compile round-trip timings include transport and any admission retries.',
      'The job response provides program duration but omits broker execution IDs and Kubernetes stage timings.',
      'The configured logical concurrency does not establish broker saturation.',
      'Cancellation under saturation was not exercised.', 'CPU and RAM usage were not measured.'],
    cpuUsage: null, memoryUsageBytes: null};
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
  if (report.sequential.failed || report.concurrent.failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    // Never print credentials, transport URLs, or server diagnostics.
    process.stderr.write('Capacity measurement failed. Check the local broker, credential file and tsx loader. Usage: --run --url <local broker URL> --token-file <credential file> [--concurrency 1-8] [--repeat 1-10].\n');
    process.exitCode = 1;
  });
}
