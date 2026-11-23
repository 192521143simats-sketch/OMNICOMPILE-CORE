# Compiler dashboard update — 23 November 2026

The compiler form no longer offers Compilation worker preference. Submissions use
AUTO admission: prefer a network with local participation and configured toolchain
fallback; if none qualifies, admit a compatible native-only network. Native-only C
uses native source compilation rather than sending IR to a browser without a
compiler fallback. Existing explicit API placement modes remain supported.

Task execution success rate no longer renders Historical success trend. Timing
and availability tables and platform filters expose Web, Windows and Android.
Their overall totals still include supporting execution services; device rows
retain actual registration provenance. A backend Linux service is never relabelled
as a Windows or Android device. Resource utilization remains unchanged, including
real measurement flags and stale-data handling. No sample jobs or fabricated
telemetry are inserted into the application database.

Completion timing now accepts the earliest verified coordinator receipt across
verification methods, including independently recompiled native results. The
accepted-result gate still excludes provisional or rejected native results.

Validation: focused frontend/backend tests passed; workspace typecheck passed;
isolated metrics run a0faf3eb46428363 passed after reproducing the missing timing
(null instead of 300 ms) in 158691190475b29b. The metrics fixture creates its
browser-only IR workloads directly because public automatic admission also needs
native compilation capability or fallback. All fixture data stays in disposable
isolated MySQL. Full browser run 1ec69e00152928cf passed C/Python/Java, enrollment,
reports and downloads, and verifies the removed preference control. 69 operations
tests passed. The initial broad unit run had 602 passes, 12 opt-in skips and one
compiler timeout under concurrent build load; the focused rerun passed all 25 tests, including the previously timed-out compiler case. Workspace production builds also passed.

This update does not reset databases, restore revoked registrations, change native
packages or establish physical Android release acceptance.

Deployment: coordinator and frontend Docker images rebuilt and restarted without
changing database volumes. Vercel production deployment dpl_HmA2SYjoZh9NMJfyk1gHcg98BZEd
is READY at the canonical application URL. The read-only public smoke passed all
25 page routes and 10 backend API checks with no browser exceptions.
