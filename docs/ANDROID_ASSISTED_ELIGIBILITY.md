# Android assistance eligibility and optimization crosscheck

## Observed production state

Android NODE-A001 advertised server-assisted compilation, Wi-Fi, foreground
lifecycle, safe thermal readings, 76% battery and a 16 MiB contribution budget.
The scheduler used a fixed 32 MiB device working-memory estimate for assistance,
so it excluded this otherwise-ready device. This was not missing GCC/JDK/Python
on Android. The pricing task inputs were only 260 and 256 serialized bytes.

## Correction

Scheduling now receives the actual serialized task size. For assisted compilation,
the device estimate is `max(1 MiB, 8 * inputBytes)`, matching the Android agent's
existing eight-times-UTF-8-input admission rule with a minimum protocol allowance.
The estimate covers incremental device input/protocol work, not its OS/runtime
heap and not the server compiler memory. Unspecified sizes retain the conservative
32 MiB fallback. Invalid sizes fail closed. Native compiler budgets are unchanged.

Initial network selection uses the submitted input size; after planning it uses
the largest real unit payload. Dispatch and transactional assignment use each
exact task payload. Compiler metrics use the same task-derived budget, avoiding
disagreement between scheduler eligibility and the availability table. Device
contribution caps, thermal, battery, lifecycle, Wi-Fi, heartbeat and consent checks
remain enforced. No stored device policy was increased or bypassed.

The updated coordinator and executor images were built and normal startup passed.
The physical Android device was subsequently offline/stale; a foreground reconnect
was requested. Configuration/source tests do not establish physical-device execution.

## Interpreting the supplied results

The pricing program has two dependency-preserving C function units. A third idle
device cannot receive a distinct unit from that two-unit plan. Jobs with enough
units can use all eligible same-network devices; single-unit work remains valid.
Server tools do not become workers and no duplicate tasks are invented for display.

The Java `ReconciliationFailure` sample intentionally compares ledger 12000 with
bank 11900 and throws. Compilation can succeed while program execution fails;
the shown 0% job success is correct. Compilation verification is a separate check.

The C pipeline really compiles with GCC `-O2`, `-fdce`, `-ftree-dce` and compares
against an actual `-O0` executable. Whole-file sizes can match despite optimization.
A separate bounded, network-isolated pricing-fixture compilation measured `.text`
at 413 bytes for O0 and 375 for O2, while both files were 18,416 bytes. This is
machine-code-size evidence, not a measured speedup and not the exact production
artifact (whose filename/layout yields 18,424 bytes). The first ad-hoc probe's
attempt to execute from noexec tmpfs was rejected; it was rerun for static section
measurement only without changing isolation. The earlier production sandbox run
verified the expected pricing output.

The screenshot download arithmetic is consistent: C 18,424 + PDF 4,956 = 23,380;
Java archive 758 + PDF 5,204 = 5,962. Java's optimizer primary class bytes are a
different quantity from its complete archive download bytes. No runtime speedup
or unmeasured removal counts are inferred from these values.

## Verification scope

The new small-input Android/16 MiB regression failed before the scheduler change
and passed afterward. All 37 focused scheduling, assistance and metrics tests and
the coordinator typecheck passed. Integration evidence is recorded below after
completion. Physical Android execution requires a connected device and a new job;
historical task attribution is not rewritten.

- `fa7a0e8cd7e75e67`: all nine C/Python/Java and logical Web/Windows/Android
  combinations passed actual server-tool compilation and isolated execution.
  Android advertised its real-app default 16 MiB policy. Assertions checked GCC
  O2 selection, positive Java/Python literal-folding evidence, authorized compiled
  output/PDF downloads and their exact recorded-versus-stored byte lengths.
  Deliberate runtime and syntax failures retained 0% job success.
- `3285a76ab1e56a61`: the expanded mixed-worker fixture failed admission because
  it declared memory readings unavailable while imposing a memory cap on every
  identity. This was an invalid fixture combination, not proof of a product
  regression. The fixture now retains unknown browser memory with no invented
  browser cap and supplies explicit simulated native/mobile memory readings.
- `5dd57210704ace11`: admission succeeded for all three identities, but the
  fixture's 15-second HTTP timeout cancelled a tool request waiting behind two
  running sandbox jobs. The fixture now uses the Android client's existing
  35-second compiler HTTP budget; production task leases and compiler limits were
  not increased. Later acceptance is recorded separately below.
- `88f7780f269bc95a`: the corrected mixed-worker integration passed. Four actual
  C function-context tasks reached all three logical Web/Windows/Android workers
  in one network, with Android at 16 MiB, matching GCC assembly, correct factory
  output and an executable artifact. All three platform rows counted one available
  worker after completion. This does not establish execution on the user's phone.

The currently deployed backend passed normal startup and public Vercel login,
ticket issuance and authenticated WSS snapshot checks. All real worker records
were offline at the final read-only check; worker applications must reconnect
before a new production submission. No production job history was rewritten and
no database reset was performed during this correction.
