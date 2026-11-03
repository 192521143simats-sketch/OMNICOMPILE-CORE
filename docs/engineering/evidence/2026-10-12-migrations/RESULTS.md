# Migration foundation evidence

Scope: adopt the existing MySQL schema under an explicit migration ledger without replacing tables or resetting records. Future schema changes must append immutable migration IDs/definitions. The checksum covers the complete frozen migration artifact (SQL, helpers and backfills), normalized to LF, not automatic schema-drift detection or a production rollback guarantee. All statements execute on the connection owning the migration lock. Build copies the exact artifact; source and built definitions match.

TDD: `npx vitest run apps/coordinator/src/migrations.test.ts` initially failed because the migration implementation did not exist. After implementation, three tests pass: ordered unique IDs, unknown/newer and changed definitions rejected, valid applied prefix and gaps checked.

Under portable Node 24.21.0: `npm run verify` exit 0; 63 unit tests in 22 files, 3 script tests, all eight workspace typechecks/builds. After review fixes, `node scripts/Run-Isolated-Integration.mjs all` exit 0, isolated fixture `70afb29499df1a83` (earlier foundation run `cf19750c81c849c6` also passed):

1. Actual MySQL migration ledger adoption; concurrent startup serialized by a connection-owned advisory lock; deliberate failure after implicit DDL not recorded; idempotent restart completes once; changed definition and unknown/newer database rejected. Actual baseline ALTER interruption/recovery preserves owned legacy-shaped rows, network name and artifact bytes, and completes identity/language backfills. Every historical missing-column/index/foreign-key upgrade path is not yet covered.
2. Actual InnoDB contention and bounded transaction retry.
3. Versioned WebSocket contract, origin and revocation boundaries.
4. Existing auth, network/node/task flow and failure recovery regression.
5. Real native Node agent C/Python/Java samples, generated artifacts and authorized downloads.

Developer database and named volumes were not migrated/reset. Protected pre-domain-change dump: `.runtime/backups/omnicompile-before-domain-migrations-20261012-093442.sql`, 481776 bytes. A dump is not restore verification; an isolated restore remains required.

ADB detection repeated: authorized Redmi M2004J19C present. No native Android APK or Windows installer has been generated or installed. Logical WebSocket fixtures are not physical/browser device acceptance evidence.

Next: atomic single-use hashed expiring invitations with coherent onboarding, registration/capacity race fixes, then remaining dependency-ordered compiler/task and native-worker phases. The platform is not release-ready.

Independent read-only review requested fixes to checksum scope and lock-connection execution; both implemented and re-reviewed with no remaining Critical/Important findings. Final trailing-blank-line cleanup was followed by another complete successful verify/integration run (`f5b3d5d3e0ac80b9`). Complete final frozen artifact normalized SHA-256: `7bdb85b42c922cdae170088b7de4164d13b8536883b7252abe1c8e7777014bcc`.
