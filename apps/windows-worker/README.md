# OmniCompile Core Windows worker

Build from the repository root on Windows x64:

```powershell
npm ci
npm run package:windows
npm run verify:windows
npm run verify:windows-install
```

The last command requires the retained 0.1.0 baseline installer in
`.runtime/windows-worker/releases/baseline/` to exercise a real upgrade to 0.1.1.
It refuses to replace an existing user installation. Integration tests provision
their own temporary MySQL fixture, not the developer database.

The installer is generated under `.runtime/windows-worker/releases/`. It is an
**unsigned development build**, not a signed production release. Install it,
open OmniCompile Core Worker, paste an active network join link, explicitly consent and
join. No terminal or global Node/npm installation is required on the worker PC.
Use HTTPS outside a trusted local network. No public deployment is created by
the package command.

Pause, Resume, Disconnect and Leave network control the existing protocol-v2
native agent. Reopening the desktop restores its encrypted enrollment but does
not start contribution until Connect is clicked. Windows DPAPI protects the
saved credential for the current Windows account. Corrupt configuration is
preserved and ordinary enrollment cannot overwrite it.

The private Node runtime is pinned by SHA-256 before packaging. Windows Job
Objects enforce CPU, committed-memory and child-process lifetime limits. Task
duration is bounded separately. These limits apply to the worker process tree,
not the Electron interface, and are **not filesystem or network isolation**.

Native GCC/Python/JDK execution is disabled by default. Enabling it is an
explicit trusted-development-host option and requires actual installed
compatible toolchains. Their availability is detected, never simulated. This
package does not bundle or certify those toolchains or claim containment for
arbitrary untrusted programs. Browser workers remain a separate implementation
with browser-safe capabilities.

Coordinator-accepted totals and reliability are fetched from authenticated
`GET /api/worker/status`, scoped to the existing worker enrollment and network.
No admin/database credentials are supplied to this application. Activity logs
contain status transitions, not submitted source or credentials. Uninstallation
preserves protected account configuration; leaving revokes the enrollment.

Upgrades are currently manual, using a separately verified installer. Signing,
a clean supported-Windows machine acceptance run and full untrusted native
compiler isolation remain release gates; developer-host tests are not their
substitute.
