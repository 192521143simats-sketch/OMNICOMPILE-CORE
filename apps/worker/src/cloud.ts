import {readFile} from 'node:fs/promises';
import {NativeWorkerSession} from './session.js';
import {profile} from './profiler.js';
import {languageProfile, type WorkerLanguage} from './cloud-profile.js';

const coordinator = process.env.COORDINATOR_URL;
const language = process.env.OMNICOMPILE_WORKER_LANGUAGE;
const credentialFile = process.env.WORKER_CREDENTIAL_FILE;
if (!coordinator || !['c', 'python', 'java'].includes(language ?? '') || !credentialFile) {
  throw new Error('Cloud worker requires COORDINATOR_URL, OMNICOMPILE_WORKER_LANGUAGE and WORKER_CREDENTIAL_FILE.');
}
const credential = (await readFile(credentialFile, 'utf8')).trim();
if (!credential || credential.length > 4096) throw new Error('A valid scoped enrollment credential is required.');
const detected = languageProfile(await profile(), language as WorkerLanguage);
let previous = '';
const session = new NativeWorkerSession({
  coordinator,
  credential,
  profile: async () => detected,
  onState: state => {
    const status = `${state.status}:${state.nodeId}:${state.submitted}:${state.failed}`;
    if (status !== previous) {
      previous = status;
      console.log(JSON.stringify({event: 'cloud_worker_state', language, status: state.status, nodeId: state.nodeId, submitted: state.submitted, failed: state.failed}));
    }
    if (state.status === 'REVOKED') void session.stop().then(() => process.exit(2));
  }
});
session.start();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { void session.stop().then(() => process.exit(0)); });
}
