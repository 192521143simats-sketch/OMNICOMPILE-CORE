# Executor protocol mismatch after fresh launch

The fresh data reset reused existing image tags. The deployed coordinator and
C compiler image supported `c_plan`, `python_plan` and `java_plan`, but the
executor image `sha256:d9e51067f0648a8aa386ed56aedbbf431134d842eab7f4c38bc41cd836c076c8`
did not. Its process/image readiness checks passed despite the request-contract
mismatch. The pricing sample therefore failed before device tasks were created.

Reproduction: a read-only query retrieved the failed pricing job source; sending
its `c_plan` request to the authenticated deployed executor returned HTTP 400
`INVALID_EXECUTOR_JOB`. No source text or credentials were printed.

Repair: rebuilt the executor and coordinator dependency using Compose, then ran
normal startup without resetting any volumes. Startup now compares the executor
request-schema SHA-256 in both image tags using network-isolated, read-only probe
containers. A mismatch triggers an executor/dependency rebuild and a second check
before services start. This guards that contract, not every possible image drift.

Verified after repair:

- PowerShell startup syntax and all 12 Docker executor unit tests passed.
- Normal application startup completed successfully; saved public routing remained.
- The original pricing source planned into two units, compiled to an 18,424-byte
  executable, and ran in the sandbox with exit code 0 and `invoice_cents=1205`.
- Vercel login, ticket issuance and authenticated public WSS snapshot passed.
- Isolated integration `70855adfb5a8515b` passed the complete C function-context
  distribution path: four tasks across two logical Web worker identities, verified
  assembly, executable publication and expected factory result. This is isolated
  protocol-fixture evidence, not physical-device certification.

The first ad-hoc execution probe incorrectly used a wrapped task response as the
compiler result and was rejected. After unwrapping `result`, the compile/run
assertions above passed; request validation was not weakened.

The failed historical job remains failed. Submit the source again to create a new
job through the repaired pipeline. No production jobs, accounts, network records
or artifact records were created or deleted by the repair probes.
