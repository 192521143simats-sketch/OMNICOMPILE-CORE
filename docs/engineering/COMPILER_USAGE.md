# Actual compiler outputs and scope

Use `START-OMNICOMPILE.bat` from the project root. MySQL and its existing volume
remain authoritative. Sign in as admin, create an invoked network and enroll a
compatible native worker through the existing scoped onboarding. The current
developer Node agent command remains `npm run worker -- --coordinator <URL> --credential
<scoped credential>`; installer/on-device onboarding is a later phase, not claimed
complete here. Do not put that credential in a URL, source file or committed script.
Browser workers perform supported C IR optimization, not GCC/CPython/JDK execution.

Users select C/Python/Java, provide a safe source basename with the corresponding
extension, upload/paste source, and submit. Existing resource/history-based network
selection and network isolation remain. Source submissions are one file, at most
1 MB; external multi-file projects/dependency resolution are not implemented.

## C

The custom frontend retains function-level distributed C IR optimization for its
documented signed-int/void subset. Headers, pointers, structs, arrays and other
source beyond that grammar go to actual GCC C11 on a native C-source-capable
worker. Full-source compilation uses GCC `-O2 -Wall -Wextra`; explicit IR output
uses `-O0`. No arbitrary source-text splitting or fake optimization candidates.
Successful outputs include original source, actual compiled/generated source,
native Windows PE `.exe` or Linux ELF according to the compiling machine, and
JSON/PDF reports. A Windows executable is not relabelled as Linux or vice versa.
Derived source/bytecode names are bounded to the database's 255-character limit;
C executable stems use at most 120 characters for Windows toolchain path safety.
Very long C display filenames use a short internal compiler filename only.

## Python

Actual CPython parses, validates, transforms bounded integer arithmetic, reparses
the final generated source, and compiles genuine `.pyc` bytes. Assertions,
docstrings, annotation expressions and branch binding semantics are preserved.
No submitted expression is evaluated by an optimizer. Power/repetition and unsafe
control-flow elimination are not performed. Outputs include original `.py`,
`compiled_<name>.py`, compatible-version `.pyc` and JSON/PDF reports.

## Java

Actual JDK `javac` validates and compiles source; `javap` inspects compiled methods
and descriptors; `jar` packages all produced classes. Supported single-file
constructs include packages, classes, records, enums and interfaces. Real public
static `main(String[])` (including varargs and compiled-class inheritance) creates
a runnable manifest. Libraries get valid library JARs, not fake runnable labels.
Generated source is the actual source javac processed; javac is not claimed to
rewrite Java source. Outputs include `.java`, actual package-path `.class` files,
JAR and reports. Source filenames in the web API are ASCII safe basenames;
Unicode identifiers/package names within the source are supported. Individual
artifact paths are limited to the existing storage model's 255 characters.
Preview features, external-superclass entry-point discovery and external
dependencies are not enabled.

## Reports and failure

All languages use the requested ten-section user-facing structure. Actual source
size/lines, artifact names, errors/warnings and their locations are job-specific.
Recommendations reference actual diagnostics; only performed transformations
are listed. JSON includes actual generated source where transformation occurred;
downloadable source is authoritative. Failure reports contain real errors and no
executable, bytecode or JAR placeholders. The failed stage remains visible.
Failures/report artifacts are committed atomically and remain owner/admin-only.
Java library reports explain that they are not standalone runnable programs.

Processing time measures actual job wall time (including distributed waiting),
not claimed CPU time or acceleration. With `OMNICOMPILE_EXECUTION_MODE=docker` (default),
the final supported program is actually run in an owned Linux Docker container.
Optional standard input is supplied in the workspace (16 KB maximum). Reports show
captured stdout/stderr, actual exit status/time and peak child-process resident
memory, not total compilation memory. Compilation can succeed while execution
fails; that produces `PARTIAL_SUCCESS`, preserving genuine compiled downloads.
Java libraries are explicitly not executed. `OMNICOMPILE_EXECUTION_MODE=disabled`
retains compilation-only operation and reports execution was not performed.

Windows C executables are retained. Execution requires a genuine Linux rebuild
from the final generated C source; its distinct `*-linux` ELF download is the
executed artifact, not a renamed Windows binary. Downloaded Linux files may need
`chmod +x` on Linux. CPython execution uses the final generated `.py`; Java uses
the actual runnable JAR. The Linux image includes GCC, CPython 3.14 and JRE 21;
external runtime dependencies are not automatically installed.

`START-OMNICOMPILE.bat` prepares/reuses the execution image after Docker/MySQL
readiness. Its first build needs Internet; failure is bounded and visible.
For manual development, use `npm run sandbox:build` before `npm run dev`.
No image is pulled implicitly during execution. Submitted programs run as UID
65534, separate from the trusted controller. Containers have no host mounts or
network, read-only root filesystem, bounded temporary storage, 512 MB memory,
one CPU, 64 processes, ten seconds execution and 64 KB combined stdout/stderr.
Two execution slots and eight bounded pending slots prevent unbounded admission.
The controller has only identity/file-ownership/termination capabilities required
to manage nonprivileged children; this is Docker shared-kernel containment, not
a universal security guarantee or native Windows/Android OS sandbox.

Native final output is independently rebuilt from stored source on the coordinator;
worker bytes alone cannot become published output. Python generated source and C
distributed transformations must match the authoritative optimizer. Therefore the
coordinator also needs the configured GCC/CPython/JDK tools. This costs actual work;
no distributed speedup is inferred. Failed worker diagnostics and arbitrary portable
compute tasks do not yet have independent correctness verification.

## Verification and remaining release gates

`npm run verify`: all workspace typechecks, unit tests, script safety tests/builds.
`npm run verify:artifacts`: owned temporary MySQL, real coordinator/native worker,
original and advanced language fixtures, downloadable outputs, negative programs.
`npm run verify:execution`: owned temporary MySQL/coordinator/native worker,
actual C/Python/Java execution, standard input, runtime failures, timeout, Java
library handling, authorized reports and invalid source diagnosis. Enable Docker
unit tests with `$env:OMNICOMPILE_SANDBOX_TEST='1'; npm run verify` in PowerShell.
No developer database is reset.

## Report outcomes and language validation

Compilation and execution are separate phases. Valid code can compile and then
fail at runtime (for example, division by zero). The overall report/result panel
then says execution failed and PARTIAL_SUCCESS: real compiled artifacts remain
downloadable, but execution is not represented as successful. Program Information
counts compiler error diagnostics and failed execution separately; the combined
error total adds those counts, not stack frames. UNAVAILABLE infrastructure is not
counted as a user-code error. Warnings are actual compiler diagnostics or recognized
Python runtime warnings, not guessed static-analysis findings.

Runtime locations identify the executed/generated file, whose line numbering may
differ from the original input after optimization. Corrected reporting applies to
new jobs; stored historical reports are not rewritten.

Source extensions must match the selected language. Clear foreign-language
declarations are rejected before scheduling, with selected/supplied language in
the message. Comments/string literals are ignored; ambiguous and polyglot source
is judged by the selected real toolchain. Text alone cannot universally identify
a program's language, and this check is not presented as a universal classifier.

Run every existing sample and the mismatch matrix in isolated MySQL/Docker:
`$env:OMNICOMPILE_TEST_SAMPLES='1'; npm run verify:execution` (PowerShell).
This exercises the six easy/tough files, three deliberately invalid industrial
files, repaired industrial variants submitted in memory, real warnings/runtime
failures, all 18 foreign-language combinations and 18 extension mismatches.
Original sample files remain unchanged. The two C easy/tough samples intentionally
return 1 for a true check; that is reported as non-zero execution, not fabricated
success. Return 0 from main when a successful process exit is intended.

Subprocess/source/output/time limits and disabled Java annotation processors do
not sandbox host compiler invocations. Full compilation containment, broader result
verification, task leases/cancellation, packaged Windows and native Android
applications, signatures and physical-device acceptance remain separate master
requirements. Execution bounds can reject valid but resource-intensive programs;
the system must report this honestly, not force a success. This phase does not
claim the entire platform ready.
