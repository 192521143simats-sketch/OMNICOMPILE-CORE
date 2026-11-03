# Report diagnostics and language admission - 2026-10-13

Baseline: `95f01abef2fcb34b3002a84281949cee3fc12583` on
`engineering/omnicompile-release-foundation`. Existing MySQL, compiler pipelines,
authentication, worker v1 protocol and artifacts are preserved. No developer
database reset, credential change, frozen migration change or volume deletion.

## Implemented scope

- Compilation and execution are distinct facts. A genuinely compiled program
  that exits unsuccessfully retains usable artifacts but reports `PARTIAL_SUCCESS`,
  execution failure and actual diagnostics, not an unconditional final success.
- Program Information counts actual compiler errors, execution failures and
  warnings separately. Known Python runtime warnings are retained; duplicate
  warnings are deduplicated. A traceback is one failed execution, not an invented
  error per stack frame. Infrastructure unavailability is not a source-code error.
- Report errors identify compilation/execution phase and actual source position
  where available. Python execution locations identify the generated artifact
  that ran. Recommendations follow the actual diagnostic or exit result.
- All languages retain the same ten-section JSON/PDF report structure. Seconds,
  byte sizes and unavailable measurements are presented honestly. Section headings
  no longer appear alone at the foot of a page.
- The compiler screen shows persisted report diagnostics/counts and real execution
  results. A rejected submission clears stale results; failed jobs keep polling
  briefly for their report publication rather than hiding the diagnostic report.
- Known foreign-language declarations and wrong source extensions are rejected
  before scheduling. Comments/string contents are masked. Ambiguous/polyglot
  source is diagnosed by the selected actual compiler, never silently switched.
  Conservative recognition does not claim universal language identification.

## Red/green evidence

Report assertions first reproduced contradictory success text and zero runtime
error/warning counts. Live fixture `9a928e10ba93ce4a` reproduced foreign C content
renamed to Python being accepted (HTTP 202). The classifier and UI tests also
reproduced valid enum/generic/typedef false positives and stale failed-job polling;
these were corrected without weakening compiler assertions. Expanded fixture
`114d4de6981bd9ad` passed before the final repaired-industrial additions.

An interrupted verification run left two owned temporary MySQL containers. Their
exact names and `omnicompile.test.instance` labels were validated before removal; no
developer MySQL container or persistent volume was removed. Docker Engine was
started and readiness verified before fresh tests.

One fresh unflagged unit run timed out the six-compilation C short-circuit test
at 30 seconds during Docker startup. No timeout/assertion was changed. The complete
C code-generation file rerun with `--maxWorkers=1` passed all 13 tests in 13.11
seconds after engine readiness. This supports transient contention, not a proven
compiler semantic defect; final full verification is recorded below separately.

## Fresh isolated execution verification

Command (PowerShell, portable Node 24.21.0 on PATH):

```powershell
$env:OMNICOMPILE_TEST_SAMPLES='1'
$env:OMNICOMPILE_TEST_PDF_OUTPUT=(Join-Path (Get-Location) '.runtime/report-diagnostics')
npm run verify:execution
```

Fixture `8048bde042cf8403`: migrations and execution verifier both exited 0.
Its sanitized execution log is retained beside this document. It checks actual
GCC/CPython/JDK compilation, native-worker optimization, coordinator aggregation,
Docker execution, report records/downloads and owner/admin authorization.

| Submitted original sample | Actual result | Compiler errors | Execution failures | Warnings |
|---|---|---:|---:|---:|
| sample-c-easy.c | Compiled; process exited 1 | 0 | 1 | 0 |
| sample-c-tough.c | Compiled; process exited 1 | 0 | 1 | 0 |
| sample-python-easy.py | Compiled and executed | 0 | 0 | 0 |
| sample-python-tough.py | Compiled and executed | 0 | 0 | 0 |
| sample-java-easy.java | Compiled and executed | 0 | 0 | 0 |
| sample-java-tough.java | Compiled and executed | 0 | 0 | 0 |
| sample-c-industrial.c | Compilation failed | 1 | 0 | 1 |
| sample-python-industrial.py | Compilation failed | 1 | 0 | 0 |
| sample-java-industrial.java | Compilation failed | 1 | 0 | 3 |

The original C easy/tough files explicitly return 1 when their calculation is
true. Reporting that exit as unsuccessful execution is correct; the samples were
not edited to manufacture success. All nine original files were exercised; only
six are the original easy/tough set. Three industrial repairs are made in memory
by the verifier, not written over the user's samples: repaired C, Python and Java
all execute successfully with 1, 0 and 3 genuine warnings respectively. Python
transformation counts and changed generated source are also asserted.

Additional checks include zero division at generated Python line 1, Python runtime
warning, C unused-variable warning, valid C enum and generic Java, Java arithmetic
failure, genuine 10-second timeout with responsive worker heartbeat, Java library
`NOT_RUN`, invalid programs, nonexistent downloads and ownership. All 18 foreign
content and 18 wrong-extension submissions were rejected (36 checks total).

Fresh downloaded C-success and Python-zero-division PDFs were rendered using
`pdftoppm -scale-to 1000 -png`; both pages of each were visually inspected. Actual
failure/count/location/advice and successful measured C output were readable,
without clipped text or orphan section headings. Temporary PDFs/images remain
ignored under `.runtime/report-diagnostics`, not committed as build artifacts.

## Full regression verification

`$env:OMNICOMPILE_SANDBOX_TEST='1'; npm run verify` exited 0 under portable Node
24.21.0 after Docker readiness: all eight workspace typechecks/builds, all 156
Vitest tests across 30 files (including actual Docker tests and React rendering)
and all three script safety tests passed. The C test that previously timed out
also passed unchanged in this full run. No failing check was suppressed.

`npm run verify:integration` exited 0 with three freshly owned fixtures:

- `7b5a2c26310637c7`: migrations, real InnoDB concurrency, worker v1 protocol,
  platform/auth/network/scheduler and real language artifacts/downloads passed.
- `d6bfe6b0543e3964`: migrations and enrollment races/consent/capacity/stable
  identity/reconnect/leave/revocation/authorization passed (logical clients).
- `5adb62ce246ba167`: reusable default link, multiple devices, admin revoke/invoke,
  admission closure and compatibility/recovery checks passed (logical clients).

Each runner finished with exit code 0 and cleaned its owned temporary test MySQL
container. Developer database and named volume remain untouched. After the ledger
updates, `node --test scripts/Generate-Requirement-Ledger.test.mjs` also passed;
`git diff --check` and the staged-path exclusion check passed.

## Remaining boundaries

These tests do not prove arbitrary-program correctness, universally decidable
language recognition, physical mobile/browser acceptance or release readiness.
The web diagnostic component has actual React rendering assertions and a web
build, not a newly performed phone/browser UI acceptance test. Native Windows
installer and native Android APK/device acceptance remain open. Existing historical
reports are immutable; submit again to generate a report using these fixes.

Next architectural iteration remains Phase 4 task leases/cancellation/durable
recovery and independent verification of other task kinds, not an unrelated
compiler rewrite.
