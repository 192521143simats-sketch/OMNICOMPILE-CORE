# Compiler execution and verification evidence - 2026-10-13

Baseline: `1c3aaf71e0d02f55e99a92fc1e44e57c69de5b2c`, engineering branch.
Existing MySQL, auth, enrollment, worker v1 and language pipelines are preserved.
No developer records, credentials, volume or frozen migration were reset/changed.

## Implemented scope

- Genuine bounded final C/Python/Java execution in an owned Docker Linux container.
  Optional standard input, captured stdout/stderr, actual exit/time/peak child RSS.
- Retained Windows C executable plus independently compiled and executed Linux ELF;
  actual Python generated source and runnable Java JAR execution. Java libraries are
  `NOT_RUN`, not falsely executable. Runtime/infrastructure failure is distinguished
  from successful compilation, with `PARTIAL_SUCCESS` and genuine artifacts retained.
- Independent native publication from authoritative stored source; C IR transformations
  and counts rederived by the coordinator. User optimization descriptions use actual
  per-function counts, not worker-reported or invented transformations.
- Existing ten-section reports/PDF/UI show actual execution details and relevant
  diagnostic advice. Artifact owner/admin checks remain. No unsupported artifact
  placeholder is created. Large base64 decoding no longer overflows the regex stack.
- Separate trusted controller and unprivileged submitted child identities; no host
  mount/network/host secrets, read-only root filesystem, bounded memory/CPU/processes,
  temporary storage, time/output and admission. Owned cleanup checks labels/retries.
- Windows startup prepares/reuses the execution image; first build requires Internet.
  Finalization no longer blocks serialized worker heartbeat messages.

## Failures investigated and corrected

Report tests first failed missing measured execution, unconditional runtime success,
and source size used instead of C executable size. Initial controller tests failed
before implementation. Real C execution found Docker tmpfs default `noexec`; only
the dedicated bounded `/work` tmpfs now permits execution. Memory measurement was
corrected to `wait4` for the executed child, not prior compiler high-water usage.

Windows PowerShell 5.1 Docker-template quoting failed, then a Process.ExitCode handle
race falsely reported a successful image build as failed. Raw inspect JSON and a
retained process handle fixed both; actual preparation/reuse subsequently passed.

Read-only review found dotted names, oversized truncation, same-UID controller
interference and regex-stack overflow. Real controller-tampering and 4 MB executable
tests failed before fixes and passed afterward. Oversized output is refused, never
truncated into a purported usable download. Canonical base64 and padding are checked.

Isolated fixture `89a1fc595942a1a2` failed the new heartbeat-during-timeout test.
After background finalization, `e0cec9d95d42fe71` passed. Expanded C IR fixture
`79cb9046fbba7d06` failed: JSON string equality rejected MySQL-reordered keys.
A focused failing unit test reproduced this. Structural JSON-normalized comparison
fixed it without accepting changed program contents. Full fixture
`4e3d70a892bdde8e` passed the final flow. One full run also exposed expensive Vitest
deep comparison of a 4 MB Buffer; native Buffer.equals preserves the exact assertion
without per-element assertion-framework overhead. No execution limits were enlarged.

## Actual commands and results

Verification uses `.runtime/toolchains/node-v24.21.0` prepended to PATH, not global
Node 26.8.1. GCC 15.2.0, CPython 3.14.7, JDK 21.0.12.1 and Docker 29.8.2 present.

- `$env:OMNICOMPILE_SANDBOX_TEST='1'; npm run verify`: exit 0. All eight workspace
  typechecks/builds, 133 tests in 28 files (including ten genuine Docker tests),
  and three script safety tests passed on the final code. No Docker test was skipped.
- `npm run verify:integration`: passed. Owned fixtures `3d83ebf810c47858`
  (migrations, actual MySQL concurrency, protocol, platform, artifacts),
  `f6f6f786ca4ab9bb` (migrations/enrollment), `1dc66ce5179939c2` (reusable links).
  Artifact regression executes thirteen genuine language fixture outputs, checks
  warnings/transformations/libraries/Unicode/maximum names/annotations, invalid
  programs, missing artifacts and owner authorization.
- `npm run verify:execution`: passed on final fixture `4e3d70a892bdde8e`:
  full-source C plus C distributed IR, Python and Java actual successful execution;
  supplied input for all three languages; actual Python/Java runtime errors; timeout;
  heartbeat progressing during execution; Java library not run; actual located C,
  Python and Java compiler errors without fake outputs; anonymous 401/other-owner
  404 downloads. Migrations passed before writes. Test fixtures cleaned by owner.
  The deliberately interrupted heartbeat-RED run left one stopped execution
  container when its coordinator was terminated before cleanup. Exact ownership
  label/status were inspected before removing that one temporary container. No
  execution or integration test containers remain; abrupt-crash automatic recovery
  is still a Phase 4 gate, not claimed solved by normal finally-block cleanup.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File
  scripts/Prepare-ExecutionSandbox.ps1 -ProjectRoot <project-root>`: actual build
  and subsequent reuse passed. Both startup PowerShell scripts parsed successfully.
  Full normal startup/shutdown against developer services was not run this phase.
- `pdfinfo`, `pdftoppm -scale-to 1200 -png`, image inspection: actual downloaded
  successful C and runtime-failing Python PDF pages inspected. Final-result section
  stays together; diagnostic/output and memory-measurement scope are visible.
  Preview files are intentionally ignored in `.runtime/execution-pdf-preview`.
- Independent read-only reviewer found no remaining Critical/Important issue after
  fixes; reviewer independently validated canonical decoding at 4/8 MB and malformed
  input rejection. Full test/PDF claims above are primary-agent evidence, not inferred
  from reviewer assertions.
- `D:/Android/Sdk/platform-tools/adb.exe devices`: no connected device. No APK,
  Windows installer, device installation/test or public deployment was performed.

## Boundaries and next task

This is not platform completion, full host compiler sandboxing or universal
correctness. Single-file/1 MB inputs, configured language versions/dependencies,
bounded execution and platform-target differences remain truthful scope. Peak child
RSS includes child startup/runtime overhead, not total build memory. Docker shares
its Linux kernel; independent native verification consumes actual coordinator CPU.
Failed worker diagnostics/other portable tasks still need independent verification.

Native final bytes are rebuilt rather than asserting worker binary equivalence.
Immutable leases, cancellation, durable coordinator recovery and larger task policy
remain Phase 4. Windows installer/native Android APK/signatures/physical acceptance,
browser UI/device tests and host compiler containment remain open release gates.

Run development with `START-OMNICOMPILE.bat`; MySQL persistence is unchanged.
Manual development alternative: `npm run sandbox:build`, then `npm run dev`.
