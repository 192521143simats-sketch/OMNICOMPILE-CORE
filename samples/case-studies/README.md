# Industry-inspired compilation cases

These are original, synthetic case studies, not copied corporate production code.
They use standard libraries, fixed inputs, no credentials, no network and no external
packages. Upload one source file at a time, selecting its matching language. Keep
Java filenames unchanged because their public class names must match.

The manifest records each scenario, dependency structure, complexity, expected
standard output and expected outcome. Zero exit means success. Compiler-error
cases must produce a located diagnostic and PDF, without a runnable artifact.
Runtime-error cases compile but deliberately fail reconciliation; final success
must be 0%, even though compilation verification itself can pass.

| Scenario | Languages | What to inspect |
|---|---|---|
| Warehouse reorder | C, Java | Method calls, nested records, package rounding |
| Factory quality | C | Independent rejection and energy analyses, final join |
| Freight routes | C, Java | Cubic loops and shared matrix dependencies |
| Invoice reconciliation | Python | Exact decimal money, grouped aggregation |
| Billing pipeline | Java | BigDecimal, generics, nested record and reduction |
| Fraud windows | Python | Ordered, stateful per-account event windows |
| Manufacturing schedule | Python | Dependency graph, memoization, cycle guard |
| Manufacturing IR | C | Five supported IR functions; dependencies retained |
| Pricing optimization | All three | Constants and unreachable branch opportunities |
| Broken purchase order | All three | Deliberate syntax/undefined-symbol diagnostics |
| Reconciliation failure | All three | Valid compilation, nonzero program outcome |

Optimization opportunities do not promise smaller executables or faster runtime.
Use measured transformations and before/after values; a zero reduction is valid.
Do not split the freight matrix's dependent iterations or fraud account's ordered
updates arbitrarily. Independent functions may be optimized separately, but calls,
shared types and final program semantics must be preserved.

Current distributed compilation supports the C IR subset. `manufacturing_ir.c`
lowers to material, labor, overhead, quote and main. Python/Java case studies test
real compilation and execution, but do not establish distributed partitioning.
One connected worker may process all units; multiple workers must stay inside
the selected network. Tool-provider containers are not worker nodes.

Run isolated compiler/program checks from the repository root:

```powershell
node scripts/Verify-Case-Study-Samples.mjs
```

This uses the existing language images with no network, a read-only sample mount,
bounded CPU/memory and disposable containers. Evidence is in ignored
`.runtime/sample-validation/latest.json`. It does not touch the application DB.

For the full isolated coordinator/report/download/metric path:

```powershell
$env:OMNICOMPILE_TEST_CASE_STUDIES='1'
node scripts/Run-Isolated-Integration.mjs execution
Remove-Item Env:OMNICOMPILE_TEST_CASE_STUDIES
```

That creates a disposable database and test enrollment. Its native protocol agent
is an integration fixture, not evidence of a physical Windows or Android install.

The dedicated C distribution protocol regression is:

```powershell
node scripts/Run-Isolated-Integration.mjs c-distribution
```

It computes five actual IR units across two authenticated logical workers, checks
that all attempts stay inside the selected network, and verifies aggregation and
compiled output. This is protocol/algorithm evidence, not a hardware benchmark.
