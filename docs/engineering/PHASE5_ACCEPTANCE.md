# Phase 5 web product — v1 acceptance seal

2026-10-14. All eleven B20 Phase 5 web obligations and its exit gate passed
within the verification scope below. Phase 4 v1 remains sealed and its actual
isolated failure suite passed again. This is not a whole-platform release seal
or a promise of zero future defects.

## Implemented and verified

| Obligation | Evidence |
| --- | --- |
| Landing and routing | Actual Edge landing, role navigation and protected routes |
| Authentication | Signup/login/logout, eye controls, reset redirect, session revocation |
| User dashboard | Existing compiler plus owner-scoped Compute Tasks and Settings |
| Compiler workspace | Actual C/Python/Java uploads, successful generated outputs, accurate reports |
| History and reports | Admin-only compilation history per explicit user override; real job details |
| Downloads | Authorized actual artifacts; regression rejects foreign/missing artifacts |
| Enrollment and management | Same-link browser enrollment, admission revoke/invoke, node inspection/revocation |
| Admin console | Consolidated overview, independent ten-row task/job paging, policies, Audit |
| Live state | Fresh read/reconnect; revoked administrator WebSocket closes with 1008 |
| Responsive/accessibility | Actual Edge 390px viewport, no compiler horizontal overflow, keyboard skip link; DOM focus/feedback/pagination checks |
| Truthful controls/metrics | Persisted coordinator state and verified task results; no fabricated execution or provider delivery |

Migrations 0008/0009 extend existing tasks ownership and users preferences.
Frozen migrations 0001–0007, MySQL authority, compiler pipelines and worker
protocol are preserved. No developer data reset, volume deletion or credential
rotation occurred. Generic compute uses the existing scheduler/attempt engine.

Optional Resend/PostHog adapters are disabled by default, bounded, consent-aware
and transport-tested. No real provider request/delivery/ingestion was authorized
or verified. Configure approved provider credentials/sender before that external
acceptance gate; provider acceptance is never described as email delivery.
Mobile viewport testing is not a physical-phone test or universal accessibility
certification. Windows installer, native Android APK, physical worker/device
lifecycle and release signing remain later phases, not claims of this seal.

## Running and next phases

Run `START-OMNICOMPILE.bat` at the project root; stop with
`STOP-OMNICOMPILE.bat`. Admin uses Overview, Tasks & Jobs and Audit. Users submit
language/source/filename without selecting a network, download final results,
use `/compute` for authorized portable tasks and `/settings` for preferences
and session management. Workers explicitly consent through the network link.

Next: Phase 6 browser worker lifecycle (background/pause/reconnect/tab loss and
actual browser failures). Then 7 Windows installable worker, 8 native Android,
9 heterogeneous integration, 10 security/operations and 11 release verification.
Evidence: evidence/2026-10-14-phase5-seal/RESULTS.md.
