# Network links and retired scheduling policies — 23 November 2026

The user removed the configurable network scheduling-policy framework. Its editor,
Network details panel, GET/PATCH policy endpoints, contract, storage reader and
scheduler enforcement are removed. Migration 0025 removes only configuration_json.policy;
admission approval and device contribution limits remain intact. Automatic task
dispatch still checks capability, live resources and worker consent.

Network creation produces /join-network-a/<opaque-token>, with the immutable
network letter in lowercase (including multi-letter codes such as ab). Platform
pages append /web, /windows or /android. The token authorizes enrollment; the
label cannot grant another network's authority. Named API routes reject a mismatched
label. Existing token-only links remain compatible and browser onboarding replaces
the address with its canonical named route after inspecting the actual network.

The creation form never displays the link. Each network row owns a Show / copy link
control that reveals the link directly beneath the button and immediately attempts
to copy it. A separate Copy button remains beside the read-only link, with truthful
clipboard success/failure feedback and a local HTTP fallback.

Windows and Android packages are version 0.1.3, accepting named master/platform
links and legacy links. Windows remains unsigned development software and Android
a debug build. Installed earlier versions need updating for named-link enrollment.

Validation: 604 unit tests and 69 operations tests passed, all workspace typechecks
and builds passed. Named-route backend/migration fixture d8f321cf022b6294 and full
browser/compiler fixture 81ea98ee2bdfb3a7 passed in isolated databases. Native parser
checks passed; Android APK and Windows installer built. Live deployment checks are
recorded in ignored .runtime/named-* reports. No factory reset was performed here.
