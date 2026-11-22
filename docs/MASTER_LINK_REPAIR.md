# Master-link and native transport repair — 23 November 2026

The later user request supersedes scoped invitation generation. Administrators
create a network and its reusable master link in one action. The same canonical
Vercel link opens web, Windows, and Android onboarding. Consent creates an
individual private device credential; admission policy can require administrator
approval. A public link never confers administrator access or embeds credentials.

The scoped invitation UI, issuance/list/history/revocation routes, service methods,
and redemption path have been removed. Historical migration definitions and
unused historical tables remain unchanged to preserve migration checksums and
existing records. They cannot issue or redeem links. Existing master links and
worker identities remain valid; there is no database reset.

Native workers discover `/api/worker/connection` using their bearer credential
over the canonical HTTPS origin, then connect directly to the advertised WSS
transport. Discovery rejects redirects; advertised URLs must use TLS, the exact
worker path, and no userinfo, query or fragment. The coordinator validates the
device credential before returning transport metadata. Local private HTTP
fixtures retain same-origin transport. Reconnection repeats discovery so a
changed laptop tunnel does not require another public invitation.

Windows and Android packages are version 0.1.2. Install the new package over the
old app to retain protected enrollment storage. These remain an unsigned Windows
development installer and Android debug APK. Existing installed older binaries do
not acquire this repair from a website refresh. A physical Android device is not
currently attached for verification.

Admin order: overview metrics; network/master-link creation; Execution toolchains;
Networks and worker nodes; device approval management. Workspace controls share
spacing, sizing, borders, hover and keyboard-focus treatments. Approval management
does not generate another invitation; private credential rotation remains an
explicit recovery action.

`START-OMNICOMPILE.bat` selects PowerShell 7 and the Docker CLI explicitly, calls
`scripts/Start-Product.ps1`, and pauses on failure. Startup preserves `.env`,
volumes and worker identities; reuses existing images unless missing or `-Rebuild`
is requested; refreshes the tunnel and production Compose override; updates Vercel
if the transport changed; and verifies the public API. Logs are in ignored
`.runtime/startup`. `-NoBrowser` runs the same startup without opening a tab.

## Verification and deployment evidence
The first UI regression test failed against the old scoped-invitation screen, as
expected. An initial concurrent broad check exhausted available host memory and
was stopped; local Desktop Kubernetes was stopped without deleting its resources.
Android connection fixtures were corrected to use explicit loopback addresses,
rather than the Windows machine hostname returned by MockWebServer; public
unencrypted origins remain prohibited.


- Broad unit checkpoint: 94 files, 603 tests passed; 12 opt-in cases skipped.
  Final affected transport/UI tests: 18 passed, including real TLS discovery to
  a different backend and reconnection. All workspace typechecks/builds passed;
  affected worker/Windows typechecks were repeated after the internal DNS repair.
- Node operations/desktop tests: 67 passed. Android: 36 JVM tests passed and the
  version-0.1.2 debug APK built. No physical Android device was attached.
- Isolated MySQL runs passed: enrollment `bdde47d3d6fbb2c8`, reusable master link
  `b20372c09eac0b55`, browser/compiler/UI `eeb9e141c3a7b4aa`, packaged Windows
  `b629fbefa0347ead`, and approval/rotation/actual-package download security
  `fad7d40e60d314b9`. Windows verified real local C, Python and Java output and
  authenticated artifact downloads. An earlier Windows fixture returned 409
  because it omitted LOCAL_ONLY while the product defaults to CLOUD_ONLY; the
  fixture now explicitly requests local execution rather than weakening that default.
- Public audit passed: 21 page routes, 10 API access checks, no browser exceptions.
  Authenticated desktop/mobile admin checks confirmed section order, no page-wide
  overflow, removed scoped API, and valid existing master link. Tables scroll
  horizontally on narrow screens instead of splitting identifiers into tall rows.
- All eight application containers are healthy. The final public overview showed
  three online managed compiler workers, four retained node records, two active
  networks, and zero compilation jobs/tasks. Tests used isolated databases.
- Both actual version-0.1.2 packages are available through master-link-authorized
  downloads; metadata identifies the Windows package as unsigned development and
  Android as debug. No signed release or physical-phone acceptance is claimed.
- Final Vercel deployment: `omnicompile-core-platform-f58wy63mo-192521143simats-9536.vercel.app`,
  aliased to https://omnicompile-core-platform.vercel.app.

Startup uncovered a previously disabled managed compiler pool and three revoked
saved enrollments. The explicit `-RepairManagedWorkers` operation created a new
managed pool and new private identities; it did not reactivate the disabled pool
or revoked credentials. Normal startup refuses to undo revocation. Two operations
regressions verify both disabled-pool replacement and revoked-worker replacement,
then verify that a repeated normal startup retains the new identities. The final
normal `.bat -NoBrowser` run passed without requesting repair or recreating the
coordinator. Startup now verifies all three worker registrations before readiness.

Managed workers explicitly permit the exact private Docker service names
`omnicompile-coordinator` and `coordinator` for internal HTTP. This opt-in exists
only in the managed entry point; desktop/public clients keep HTTPS discovery.
The production authentication hash is reused when it matches the saved password,
so ordinary startup no longer generates a different salt and recreates the backend.
Do not reset databases or copy test fixtures into the live application. Install
new worker packages over existing apps and resume contribution explicitly.
