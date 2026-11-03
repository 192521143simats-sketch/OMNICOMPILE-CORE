# Reusable default network links — 2026-10-12

Authority: explicit user instruction in `USER_REQUIREMENT_OVERRIDES.md` supersedes single-use-only master M2 R03. One default reusable link per network, invoked on creation, admin toggle, explicit per-device consent, atomic capacity and a revoked/expired page. Existing enrolled workers are not revoked by closing admission.

Verification commands under portable Node 24.21.0:

- `npm run verify`: exit 0, all eight workspace typechecks/builds, 64 unit tests in 23 files and 3 script tests.
- `npm run verify:integration`: exit 0, isolated fixtures `8e6f4617b06f57fe` (migrations, InnoDB contention, protocol, platform, real C/Python/Java artifacts), `ab2ba141bb8ee3ce` (migrations/enrollment), `527810dedc77050b` (reusable admission).
- `node scripts/Run-Isolated-Integration.mjs reusable`: exit 0, enhanced fixture `309542b1b1ae9580` additionally registers two distinct logical browser nodes from the same default link, verifies private credentials remain valid after admission closes, unauthorized link retrieval, and legacy invitations cannot bypass the toggle.
- `npm run build --workspace @omnicompile/web`: exit 0 after the UI review fixes.

Real MySQL/API checks cover default invocation, same URL retrieved repeatedly, two concurrent consenting devices with separate credentials/enrollments/registered IDs, admin-only retrieval/toggle, revoked status/rejected acceptance, existing enrollment leave, same URL after re-invocation, concurrent admission within capacity and overflow 409, disabled network cannot reopen. Existing network/node/worker/auth/compiler regression checks remain green. Migration verification deliberately interrupts actual 0003 immediately after token backfill, reruns it and confirms the assigned default token is unchanged. Frozen 0001/0002 artifacts remain unchanged.

TDD: reusable-link test first failed 404 versus expected 200 for persisted admin link retrieval (`e82f95a4832c774b`); it passed after implementation (`dd15a1666f97554d`) and after the full final regression run. Tests changed the old information-only assertion because the user explicitly made the default link an admission link; separate single-use legacy tests remain intact.

Independent read-only review: no Critical/Important findings. Minor stale join error/selected banner states corrected; reopened links clear stale errors, selected banners follow refreshed network state. Native packaging/compiler redesign was correctly excluded. Recoverable public admission token and one-time replacement of previously hashed-only information links are explicit user-directed behavior, not private credential disclosure.

Data preservation: developer database, named volumes, `.env`, private worker credentials, node IDs, jobs and artifacts untouched this turn. Migration 0003 applies on normal coordinator startup, without a reset. Existing networks then have a new default URL because old token hashes cannot be reversed. Admin uses **Show / copy link** after application restart. Existing single-use endpoints are backward compatible but gated by network admission.

Limits: API, persistence, migration, logical worker and actual native compiler regressions were tested; physical mobile/browser UI clicking and cross-device Wi-Fi were not tested in this turn. Web was typechecked and production-built. No Windows/Android package, device installation or public deployment was attempted or claimed. Shared admission links grant admission only after consent; keep them private and revoke when needed. Pending registrations reserve capacity for ten minutes, while the displayed count remains connected nodes only.

Run: `STOP-OMNICOMPILE.bat` then `START-OMNICOMPILE.bat` if an older application instance is running. Open Admin → Overview → network row → **Show / copy link**. **Revoke link** blocks new enrollments and displays the expired page; **Invoke link** restores the same URL. Do not delete/reset data to apply this change.
