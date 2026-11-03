# Phase 4 closure — verification evidence

Verification date: 13–14 October 2026 (Asia/Calcutta). Existing branch: engineering/omnicompile-release-foundation. Baseline: c7458d1255672688041a7938414305456c77fd33. **Phase 4 v1 sealed: eight master exit obligations and six closure gates passed.**

## Exact commands and final results

The project-local official SHA-verified Node 24.21.0 was prepended to PATH, without changing the global runtime. Tests were bounded to one Vitest worker because this Windows host has approximately 8 GB RAM.

| Command | Actual result |
|---|---|
| `$env:OMNICOMPILE_SANDBOX_TEST='1'; npm test -- --maxWorkers=1` | 252/252 tests, all 36 files passed; zero skips; final duration 128.23 seconds |
| `npm run typecheck` | All eight workspace type checks passed |
| `node --test scripts/*.test.mjs` | 3/3 ledger/isolated-target safety tests passed |
| `npm run build` | All eight workspace builds passed, including real Vite/browser-worker output and coordinator migration copying |
| `npm install --package-lock-only --ignore-scripts` | Lockfile consistent; 203 packages audited, zero reported vulnerabilities |
| `git diff --check` | Passed |
| `node scripts/Run-Isolated-Integration.mjs all` | Six actual isolated scripts passed; final fixture ac1ec2948075863d |
| `node scripts/Run-Isolated-Integration.mjs phase4` | Dedicated persistent-database closure fixture passed; 9562e5740adabf4a |
| `node scripts/Run-Isolated-Integration.mjs leases` | Actual contention/lease/retry suite passed after both expiry fixes; d2a366dba5ed6e2b |
| `node scripts/Run-Isolated-Integration.mjs recovery` | Real restart/outage/disconnect/reassignment/publication recovery passed; c044fb9f6ba2eb51 |
| `node scripts/Run-Isolated-Integration.mjs cancellation` | Owner/RBAC/terminal races, logical browser transport and actual Windows native process cancellation passed; e2e656e16532cb9b |
| `node scripts/Run-Isolated-Integration.mjs execution` | Migrations plus actual bounded Docker C/Python/Java execution/report fixtures passed; 6052332332dd5dcd |
| `node scripts/Run-Isolated-Integration.mjs enrollment` | Migrations plus real admission/identity/capacity concurrency passed; 8eb80bd49de4b965 |
| `node scripts/Run-Isolated-Integration.mjs reusable` | Existing default reusable link/revoke/invoke regression passed; 6b30a531c68c8216 |

Raw per-script logs, coordinator logs and exit-code summaries remain under ignored `.runtime/integration/<fixture>/`. No credential-bearing SQL dump or runtime log is committed.

## What the tests actually prove

- Actual database process restart retains deadlines and retry eligibility. The fixture uses a fixed private published port and its own retained container data directory, not the developer MySQL volume.
- Actual coordinator process death/restart interrupts active attempts while preserving original deadlines/history. Expired and superseded answers cannot create results. Bounded recovery drains 101 attempts in 100/1/0 transactions and refuses a fourth default attempt.
- Real MySQL pause/resume and connection loss do not become fake compiler errors. Cancel cannot acknowledge persistence while the database is paused; after resume it becomes durably terminal and late results are rejected. Completed C/Python results resume publication after faults.
- Failed artifact publication after the first INSERT rolls back all artifact rows and job completion. Altered content or incorrect byte length/digest cannot download. An isolated actual dump/restore into a separate owned test schema compares table counts and artifact digests/lengths.
- Actual node-row contention across network expiry rejects assignment. Actual network-row contention across expiry rejects result publication. Both were reproduced as failures before implementation changes.
- Real Windows Node worker receives and executes the new matrix and benchmark operations through authenticated coordinator transport; coordinator independently checks exact answers. Busy workers cannot bypass network operation policy. Explicit protocol disconnect is persisted as USER_LEFT, not a reliability penalty. Forced Windows process termination is correctly treated as different from voluntary disconnect.
- Native worker and coordinator cancellation/parent IPC loss stop actual GCC-built compiler descendants. Missing Windows tree-termination command fails closed. Full seven-test owned-process coverage passed in the final unit suite.
- Catalogue schema, bounds, malformed/forged answers, browser VM executor, native executor, reference BigInt/column-dot-product verifier, cancellation/yield and scheduler policies have behavioral coverage. Browser VM/logical sockets are not physical browser/device tests.
- C/Python/Java artifact suite runs 13 real source cases, downloads real outputs, executes safe fixture artifacts, checks three actual compiler failures, ownership, warnings/optimization, library JARs, Unicode/uppercase/max-length filenames and annotation semantics. Execution suite also checks runtime errors, timeouts, heartbeat, reports, stdin and no invented success.

## Failed runs, diagnosis and corrections

Failures were not counted as acceptance passes:

- Pre-aborted coordinator native verification initially returned usable bytes. Owned-process/AbortSignal integration now rejects before publishing.
- New task-policy import initially failed before implementation. Stable retry/integrity tests subsequently passed; an added high-attempt cap test reproduced 26084 versus the persisted 30000 ms cap and corrected the helper.
- Native tree fixtures initially had a shadowed source binding; corrected the fixture. Parent-loss tests then revealed genuine orphan descendants. Killing the cleanup helper's own tree was insufficient on Windows; direct owned child trees are now enumerated and terminated before exit. Actual descendant assertions pass.
- New integration mode initially rejected; added the owned phase4 mode. Restart fixtures b5397d09a8f41ecc / 4613334eca702a1e exposed changing automatic published ports after restart; fixed owned fixture port allocation.
- eafea691a16564ed / 39911bde32dc8d6f passed their assertions but retained an IPC channel and hit the 300-second runner deadline. Explicit fixture disconnect fixes this; those runs remain failures.
- 695008f8bfdcea7d failed an obsolete immediate-retry expectation after durable backoff was added. Fixtures now wait on real database eligibility without bypassing the production policy. Later all-suite fixtures passed, including final ac1ec2948075863d.
- 46195574896bc1dc correctly returned 403 when a fixture tried compiling as ADMIN. The policy rejection fixture now uses an actual USER session; no role guard was weakened.
- fc3c3368bd229b56 used forced Windows process kill as if it were voluntary disconnect, then waited on an already-ended child. Replaced with explicit authenticated protocol disconnect and signal-aware cleanup. Only the verified owned fixture process was stopped; its labelled container was removed by the runner.
- Type checking caught the test-only cross-application rootDir import and a possibly-undefined test promise. The cross-application fixture uses a dynamic URL import and an explicit started assertion; final type checks/builds pass.
- 4d9a513959b4e43c reproduced expired-network assignment after node lock wait. 655b74de9c33f320 reproduced expired-network result publication after scope lock wait. Both final predicates now use fresh MySQL time after lock acquisition; d2a366dba5ed6e2b passes both and the existing suite.

## Independent review

The first review agent could not start because of an account usage limit; it is not a passed review. The separate read-only fallback review completed against baseline c7458d1 plus the closure changes. It found one actionable network-expiry assignment race. That finding was reproduced and fixed with the live contention test. The main final inspection found the equivalent publication race and applied a separate RED→GREEN regression. No reviewer endorsement of uninspected physical devices, packages or deployment is implied.

## Preservation and boundaries

Original migrations 0001–0005 are unchanged; only 0006/0007 are appended. Existing `.env`, developer database records, MySQL named volume, compiler packages and unrelated MYSQL container are preserved. Only owned labelled test containers and test-owned temporary process workspaces are cleaned. No C-drive personal-file cleanup, database reset, credential rotation, public deployment or force push occurred.

Single-active-coordinator recovery is not HA/exactly-once execution. Worker resource estimates/claims are not hardware attestation or OS quota enforcement; host compiler containment and physical Windows/Android/browser acceptance have later phase gates. Nothing in this evidence claims an installer, APK, signed release, physical phone test or public deployment.

See ../../PHASE4_ACCEPTANCE.md for the eight master exit obligations and the exact next Phase 5/6 scope.

## Verified Git publication

- Implementation: `01f3bd4397613b37e9e894106691113e7dd0ea4d`, `feat: harden task policies, cancellation, and durable recovery`.
- 48 legitimate source/test/config/acceptance files committed; staged diff reviewed and whitespace check passed. No environment credentials, SQL dumps, runtime logs, dependencies, volumes or generated binaries staged.
- `git push origin engineering/omnicompile-release-foundation` succeeded without force to the configured Git origin.
- `git ls-remote origin refs/heads/engineering/omnicompile-release-foundation` matched the exact implementation hash. Tracked/untracked non-ignored tree was clean after implementation push.
- This seal/ledger update is a separate documentation commit; its remote hash is checked after publication. Phase 5 is the next implementation phase, not a claim that later product/package/device/release gates passed.
