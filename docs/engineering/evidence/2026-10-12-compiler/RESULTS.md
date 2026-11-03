# Compiler correctness iteration — 2026-10-12

## Scope and preserved architecture

Three language agents extended their existing packages; the main agent integrated
contracts, scheduling, worker execution, coordinator artifacts/reports and result UI.
MySQL remains authoritative. No developer database reset, secret change, migration
rewrite or Docker volume deletion occurred. Existing C function-level IR distribution,
browser-safe optimization and native Python/Java tasks remain.

C uses actual GCC C11, preserving the custom IR route and adding a capability-gated
full-source native route for constructs outside that frontend. Python uses genuine
CPython parsing/bytecode with bounded arithmetic transformation. Java uses actual
javac/javap/jar, package-aware classes and real entry-point descriptors. Reports use
the requested common user-facing structure and actual diagnostics/artifact names.
Failed jobs produce reports, never counterfeit executable/bytecode/JAR artifacts.

## Executed verification

Windows, portable official SHA-verified Node 24.21.0, GCC 15.2.0, CPython 3.14.7,
JDK 21.0.12.1, Docker Linux engine and isolated MySQL 8.4.

- `npm run verify`: 115 tests in 26 files, three script tests, all eight workspace
  typechecks and builds passed. Rerun after review corrections, not just an earlier tree.
- `npm run verify:integration`: migrations, real InnoDB concurrency, versioned
  protocol, platform, language artifact flows, enrollment and reusable-link suites
  passed. Owned fixtures: `06dfb254218b1088`, `644438885875fbad`, `64583af9fcefdde0`.
- `npm run verify:artifacts`: final targeted repeat includes currency-symbol Java
  package names, genuine downloaded JAR execution, and all artifact cases below.
  Fixture: `54cec2b2f8daebba`; raw evidence is ignored under `.runtime/integration/`.
- PDF previews generated from actual success/failure downloads; rendered with
  `pdftoppm -f 1 -singlefile -scale-to 1400 -png` and visually inspected. Poppler
  reports a missing Symbol display font; inspected pages remain readable, unclipped.
- `git diff --check`: no whitespace errors; expected LF/CRLF conversion warnings.

Artifact integration submits 13 valid single-file programs: six original root
samples, C structs/headers/real warning, Python assertion/binding/docstring/folding,
Java packaged record/varargs, non-runnable Java interface library, Unicode Java
package/uppercase extension, Python future annotations, maximum-length C filename.
All required outputs downloaded with actual bytes. Twelve runnable trusted fixtures
were executed with expected output/exit status; the library archive is deliberately
not executed (the generic per-case console label does not imply library execution).
Three invalid C/Python/Java programs produce FAILED jobs, located diagnostics and
exactly JSON/PDF reports. Anonymous access fails with 401, another owner gets 404,
and nonexistent artifacts get 404. Reports never invent execution/memory measurements.

## Red/green evidence and review

Tests exposed and verified corrections for C eager logical evaluation, discarded
void calls, prototypes, merge-value liveness and integer overflow folding; Python
assertions/docstrings, local bindings and future annotations; Java declaration names,
packages, records, inherited/varargs main, Unicode launcher behavior and human-readable
diagnostics. Main tests initially failed unconditional report success and artifact
validation before implementation. Review found and fixed maximum-length Windows
executable paths, derived filename bounds, capability negotiation, safe Unicode
download headers, and legal Java currency/connector identifiers. The last identifier
test failed before its validator correction. Missing configured GCC errors no longer
expose private tool paths. Dedicated missing-JDK-binary acceptance is not claimed.

## Limits and next phase

This is real single-file toolchain compilation, not a promise that every source or
multi-file dependency project compiles. Syntax/type errors correctly fail. Java
libraries are valid archives, not falsely runnable. Python bytecode requires a
compatible CPython version; native C outputs match the compiling OS. Source is
bounded to 1 MB. External dependencies, preview Java and external inherited entry
points are not enabled. Transformation evidence is actual, not generalized advice.

Worker-result validation is identity/structural validation, not independently proved
semantic correctness. Subprocess/output/time bounds and disabled annotation
processors are not a production OS sandbox. Uploaded programs are not automatically
executed; reports explicitly say execution was not performed. Only trusted test
fixtures were run. Browser workers do not run native GCC/Python/JDK toolchains.

Next: Phase 4 immutable leases/attempts, cancellation, independent result validation
and durable failure recovery. Windows installer and native Android app/APK, physical
device installation, heterogeneous acceptance, signing and release remain open.
No APK, Windows package, ADB installation, physical browser/mobile test or public
deployment was performed or claimed in this iteration. Web application was built;
API/coordinator/native-worker integration is not physical UI acceptance.

Run existing development startup: `START-OMNICOMPILE.bat`. Verification commands
above require Docker and compatible installed toolchains. See `COMPILER_USAGE.md`
and `WORKER_PROTOCOL.md` for onboarding, outputs and additive capability rules.
