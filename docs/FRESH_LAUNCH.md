# Fresh launch baseline — 22 November 2026

The user explicitly authorized a permanent reset of OmniCompile's old application
records and artifacts, after first saving the deployment work to GitHub. The
pre-cleanup source checkpoint is `0af10c0` on `engineering/vercel-backend-demo`.
This Git checkpoint contains source, not a database backup.

## Application state

The old `OMNICOMPILE-MYSQL` and `OMNICOMPILE-ARTIFACTS` volumes were removed and
recreated. Schema migrations initialized the new database. Internal compiler,
executor, and artifact credentials were rotated; the managed worker enrollments
were recreated. Previous user accounts, sessions, invitations, job history,
results, compilation artifacts and artifact bytes are gone.

Read-only verification established:

| Record/resource | Fresh count |
|---|---:|
| Configured bootstrap administrator | 1 |
| Ordinary user accounts | 0 |
| Managed compiler pool | 1 |
| Approved, available compiler workers | 3 |
| Compilation jobs, tasks, results and optimization batches | 0 |
| Artifact records and stored artifact objects | 0 |
| Old invitations and legacy sessions | 0 |

Bootstrap security/audit records describe the real initialization, not fabricated
customer activity. The existing configured administrator password is retained.
Users register and devices enroll afresh; old participation links are invalid.
The compiler editor starts empty and language changes do not insert examples.

## Docker and file cleanup

- Removed the two retired acceptance-cluster containers, their two dedicated
  volumes, and an unreferenced historical OmniCompile Kubernetes/MySQL volume.
- Removed the old Kubernetes acceptance image.
- Stopped the unused local Docker Desktop Kubernetes infrastructure. Its managed
  containers, images and volumes remain available for future Kubernetes work.
- Preserved the separate `MYSQL` container and `mysql` volume on port3306 at the
  user's explicit instruction. They are unrelated to OmniCompile's port3307 DB.
- Rebuilt all eight application images. Project test files and sample fixtures
  are excluded from image contexts; production runtime uses built images rather
  than source-file patch mounts.
- Generated integration outputs, the unpacked Windows development bundle,
  acceptance-only Android outputs, obsolete logs, and old publication scratch
  were removed through the user-run cleanup script after automatic review
  blocked direct filesystem deletion. OCI keys were moved, integrity-checked,
  into ignored `.runtime/oci-credentials` and never committed.
- Kept the actual downloadable worker packages, application source, regression
  tests and their small fixtures, required toolchains, release verification
  tools, and current security evidence. These support future development and do
  not seed the running application. Native packages retain their actual unsigned
  Windows/debug Android status; cleanup does not create signed releases.

## Verification

- Fresh image scans: zero HIGH/CRITICAL findings in all eight image reports.
- Source suite:596 passed,12 opt-in skips. An obsolete identity in a handoff path
  caused an operational check failure; the path was corrected and all65 script
  checks then passed. All workspace builds passed.
- Isolated web flow passed with empty initial/language-switched editors, real
  C/Python/Java compilation, reports/downloads, error locations, authentication,
  browser/mobile enrollment and portable computation.
- Exact rebuilt-image acceptance passed migrations, proxy/auth/roles, compiler
  secret-read denial, sandboxed execution, two concurrent jobs and12 verified
  outcomes, without using the developer database.
- `node scripts/Verify-Fresh-Launch.mjs --public` checks fresh counts, administrator
  password compatibility, worker readiness, empty object storage and public
  connectivity without creating users, compilations, enrollments or artifacts.

Current operation remains laptop-hosted behind the Vercel frontend. Keep Docker,
the laptop, internet and the active K: Docker disk available. OCI A1 capacity,
native ARM/runtime verification and physical remote native-device acceptance are
separate outstanding gates. Existing published ARM images are a prior source
checkpoint and must be rebuilt/pinned for the new source before OCI deployment.

## Operations

From the real repository root, with Docker running and current images available:

```powershell
pwsh -NoProfile -File scripts/Start-Online-Demo.ps1
docker compose -f docker-compose.yml -f .runtime/online-demo/compose.json up -d --no-build
node scripts/Publish-Vercel-Demo.mjs
node scripts/Verify-Fresh-Launch.mjs --public
node scripts/Verify-Public-Routes.mjs
```

Do not rerun data-reset operations for normal startup. Future verification must
continue to use isolated fixtures; preserve new real user data after this launch.
