# Phase 5 verification — 2026-10-14

Base: 2e977a9f3edb14ede5b6a2a9edd18afd4a3062d0.
Runtime: repository SHA-verified Node 24.21.0; Windows, actual installed Edge,
Docker Linux/MySQL 8.4. Every live fixture uses guarded isolated databases and
labelled disposable containers, never the developer database.

## Fresh commands and results

| Command | Result |
| --- | --- |
| `OMNICOMPILE_SANDBOX_TEST=1 npm test -- --maxWorkers=1` (PowerShell environment assignment) | 302/302, 45 files, no skips |
| `npm run typecheck` | All eight workspaces passed |
| `npm run build` | All eight workspaces passed |
| `node --test scripts/*.test.mjs` | 5/5 passed, including real Windows owned process-tree cleanup |
| `npm audit --json` | Zero advisories |
| `git diff --check` | Passed |
| `node scripts/Run-Isolated-Integration.mjs all` | Passed, fixture 7b99b4db90fea8d7 |
| `node scripts/Run-Isolated-Integration.mjs execution` | Passed, 37c231f79260d5ba |
| `node scripts/Run-Isolated-Integration.mjs phase4` | Passed, a37048f459a16291 |
| `node scripts/Run-Isolated-Integration.mjs compute` | Passed, f45d7d40531cb8b2 |
| `node scripts/Run-Isolated-Integration.mjs settings` | Passed, 100dd1a71f9aa88b and strengthened f2a72b295eca940c |
| `node scripts/Run-Isolated-Integration.mjs web` | Passed repeatedly; final 734efbd297eaf082 |

`all`: migrations/concurrency, protocol, result verification, platform and actual
artifact generation/download/execution. Thirteen valid sample/edge programs,
three invalid programs, unauthorized/missing artifacts and generated runnable
outputs are exercised. `execution`: real Docker C/Python/Java successful builds,
invalid programs, runtime errors, timeouts, language mismatch and report data.
`phase4`: actual coordinator/database restart/interruption, cancellation,
leases, history, retry/backoff, native tasks and isolated restore.

Actual Edge web suite covers signup/login, consent from separate contexts and
phone-sized viewport, link revoke/invoke, two distinct completed portable SHA
tasks with verified results, admin node/task/job inspection and policy API,
disabled-network removal/counts, preferences surviving navigation, password
reset and old session revocation, self-signout, keyboard skip navigation,
mobile compiler overflow, and all three real native compiler uploads/report
downloads. It is not a physical phone test.

## Failure reproduction and repairs

- Auth DOM tests initially 7/11 failed, then 14 passed after pending/error/eye fixes.
- Compute DOM 2/5 failed; stale selection after second submission repaired, 5 passed.
- Actual web `/compute` initially routed home; corrected route and retested.
- Admin policy detail initially returned 404; implemented authorized read.
- Language selector accessible label initially failed; corrected and retested.
- Reduced-motion preference was lost on navigation; actual browser RED then GREEN.
- Owner cancellation audit incorrectly attributed ADMIN; actual RED then USER GREEN.
- Independent review found revoked sessions retained admin socket access; actual
  timeout RED then closed-1008 GREEN after session-bound broadcast validation.
- Five concurrent headless contexts pressured this 8GB host and native admission
  correctly rejected insufficient resources. Fixture now closes its owned browser
  workers before native tests and waits for actual capabilities/free memory;
  production eligibility thresholds were not lowered or fabricated.
- Reviewed fixture ownership: runner owns native child; retained spawned process
  tree cleanup is tested. Forced whole-verifier timeout was not separately injected.

Independent review findings received a fix/retest pass. No full Codex Security
scan or live provider delivery is claimed. Context7 official Playwright guidance
was used for browser verification. Provider adapters have local transport/error/
timeout/privacy tests only; no secrets or account changes were published.

Evidence summaries are retained in Git; generated fixture logs are ignored.
Necessary regression tests and sample source files remain. Native package builds,
signatures and physical-device tests remain later acceptance gates.
