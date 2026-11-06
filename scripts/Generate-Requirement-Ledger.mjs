import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// Lossless, conservative inventory: every nonblank source line is tracked,
// including examples and headings. Inclusion never implies implementation.
const directory = resolve('docs/engineering');
const bytes = readFileSync(resolve(directory, 'specification/MASTER_PROMPT.txt'));
const lines = bytes.toString('utf8').split(/\r?\n/);
const ledgerPath = resolve(directory, 'REQUIREMENT_LEDGER.json');
let previous = new Map();
let previousDocument = {};
try { previousDocument=JSON.parse(readFileSync(ledgerPath, 'utf8'));previous = new Map(previousDocument.items.map(item => [item.id, item])); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
let source = 'M', section = 'preamble', heading = '';
const areas = [
  [/password|authentication|login|session|csrf|rbac/i, 'apps/coordinator/src/auth.ts; apps/coordinator/src/server.ts', 'auth/API security integration'],
  [/android|apk|aab|compose|workmanager|thermal/i, 'apps/android-worker (required; absent at baseline)', 'Android unit, instrumentation, physical-device acceptance'],
  [/windows|installer|uninstall|desktop application|signing/i, 'apps/windows-worker (required; absent at baseline)', 'packaging, signature, clean Windows install/upgrade/uninstall'],
  [/mysql|database|migration|backup|restore|sqlite/i, 'apps/coordinator/src/database.ts; docker-compose.yml; scripts/', 'isolated MySQL migration/backup/restore integration'],
  [/compiler|compilation|artifact|gcc|javac|python|semantic|optimization/i, 'packages/compiler-c; packages/compiler-python; packages/compiler-java; apps/coordinator', 'compiler semantic differential tests and authorized artifact integration'],
  [/network|enrollment|invitation|credential|identity/i, 'apps/coordinator/src/networks.ts; packages/contracts', 'atomic invitation, identity and network-isolation integration'],
  [/task|scheduler|worker|heartbeat|protocol|lease|retry|cancel/i, 'packages/contracts; packages/orchestration; apps/coordinator; apps/worker; apps/web/src/browser-worker.ts', 'protocol, lifecycle, correctness and failure integration'],
  [/frontend|dashboard|page|accessibility|posthog|resend|email/i, 'apps/web; apps/coordinator', 'browser end-to-end, accessibility and isolated provider tests'],
];
const items = [];
for (let index = 0; index < lines.length; index++) {
  const text = lines[index];
  if (text.includes('BEGIN SOURCE A')) { source = 'A'; section = 'preamble'; }
  if (text.includes('BEGIN SOURCE B')) { source = 'B'; section = 'preamble'; }
  if (!text.trim()) continue;
  const numbered = text.match(/^#{1,6}\s+(M\d+|\d+(?:\.\d+)*)[.\s]/);
  if (numbered) { section = numbered[1]; heading = text.replace(/^#+\s*/, ''); }
  const mapping = areas.find(([pattern]) => pattern.test(text));
  const id = `${source}:${section}:L${index + 1}`;
  const old = previous.get(id);
  if (old && old.text !== text) throw new Error(`Source changed for ${id}; review requirements explicitly.`);
  items.push(old ?? {
    id, source, section, heading, line: index + 1, text,
    status: 'NOT_STARTED',
    implementation: mapping?.[1] ?? 'docs/engineering; relevant implementation selected during phase refinement',
    verification: mapping?.[2] ?? 'requirement-specific review/acceptance evidence before marking verified',
    evidence: [],
  });
}
writeFileSync(ledgerPath, JSON.stringify({
  ...previousDocument,
  schemaVersion: 1, sourceSha256: createHash('sha256').update(bytes).digest('hex'),
  sourceLineCount: lines.length - (lines.at(-1) === '' ? 1 : 0),
  policy: 'Every nonblank line retained. NOT_STARTED means acceptance not established, even if related legacy code exists. M2 governs conflicts; examples are not fabricated measurements.',
  items,
}, null, 2) + '\n');
console.log(`Inventoried ${items.length} source-qualified entries; existing evidence preserved.`);
