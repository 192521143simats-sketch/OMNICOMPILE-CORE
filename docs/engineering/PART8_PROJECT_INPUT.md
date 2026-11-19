# Project input and dependency analysis implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement and independently review each task.

**Goal:** Add secure, usable multi-file project intake and dependency analysis to the existing compiler workspace, then connect it to real project compilation and reconstruction.

**Architecture:** Preserve the single-source compilation endpoint and worker protocol. Introduce one shared bounded project manifest, a pure conservative dependency analyzer, and a USER-only analysis route consumed by a panel in the existing workspace. Static graph groups are dependency-first strongly connected components, not proof that units can be compiled independently.

**Tech stack:** Existing TypeScript, Zod, Fastify, React and Vitest; existing isolated MySQL verification and Docker/Kubernetes execution providers. No new dependencies or services.

**Spec:** User-provided `EXPECTED.docx` paragraphs313–324,383–397,468–472,587–598, plus the master directive's language-specific project pipeline and ordered Parts8/9 in `IMPLEMENTATION_LEDGER.md`. These references were inspected directly from the document XML; the document remains untracked and unchanged.

## Constraints and contract

- Preserve databases, accounts, artifact storage, credentials, existing compiler behavior and eight healthy Compose services. No public/cloud deployment.
- At most32 source/header files,255 characters per relative path and1,000,000 aggregate UTF-8 source bytes. Transport/body limits remain enforced by Fastify.
- Reject traversal, absolute/drive/UNC paths, backslashes, empty path segments, duplicate/case-colliding paths and file/directory collisions. No archive extraction, uploaded-code execution, dependency installation or network access in analysis.
- `ProjectInput`: language C/Python/Java, files with relative `path` and text `content`, optional `entryPoint` naming a submitted source file. C headers and Python package initializers may be empty.
- `ProjectAnalysis`: language, source byte count, file references, external references, dependency-first SCC groups, bounded diagnostics and explanatory notes. Valid static intake remains `REQUIRES_TOOLCHAIN_VALIDATION`; invalid manifests receive HTTP400. An unresolved quoted C include alone is not an error: GCC may resolve it through system/include search paths. Actual toolchain validation must establish compilation errors.
- C preprocessor conditions/macros, Python dynamic imports and Java classpath/type resolution require actual toolchain validation. Cycles alone do not prove invalid code. No graph result claims semantic correctness, safe parallelism or successful compilation.
- Use `POST /api/compilations/project-analysis` with the existing explicit USER role guard and normal request protections. Do not persist or log uploaded source for this read-only analysis.

## Tasks and ownership

- [ ] Backend/shared contracts: add `packages/contracts/src/project.ts`, export typed schemas/results, add behavioral validation tests. Implement `apps/coordinator/src/project-analysis.ts` and its tests, integrate the authenticated route in `server.ts`.
- [ ] Frontend: add `apps/web/src/project-analysis.tsx` and meaningful browser tests; integrate the panel in `main.tsx` without changing the existing compile submission. Reject excessive file sizes before reading; invalidate stale requests on input/language changes.
- [ ] Independent review: inspect path/resource boundaries, graph limitations, authorization and stale UI responses. Fix confirmed in-scope defects and rerun focused tests/types/builds.
- [ ] Integration: exercise actual USER/ADMIN/anonymous analysis requests against a proven isolated coordinator/MySQL fixture. Test the browser panel against that API, not only mocked components. Record and remove owned generated fixtures.
- [ ] Continue Part8/9: extend persisted project input and allowlisted toolchain tasks for real multi-file C objects/linking, Python project validation/bytecode and Java dependency-aware compilation/JARs. Preserve existing attempts, receipts, verification, artifact ownership and cancellation. Do not mark project compilation complete based on analysis alone.

## Verification and handoff

Run focused contract/analyzer/browser tests, affected workspace typechecks/builds and isolated authenticated API/browser acceptance. Add negative traversal, size, ownership, missing dependency, cycle and delayed-response cases. Recheck existing single-source compiler behavior and Docker health. Update the implementation ledger and commit only reviewed source and evidence; keep the overall goal active while project execution/reconstruction and later required gates remain open.
