# Cinematic landing and web motion

One exported Home replaces duplicate markup. GET STARTED routes to the existing /login page. Guest Login navigation is absent on /login and /signup; form links, authentication, administrator permissions, enrollment, compiler state and APIs are unchanged.

Shared motion.css and the existing Shell cover all web routes: login/signup/reset, compiler, administration, enrollment/install pages and browser worker. Carbon#0C0D10, Coral#FF4D2E, Orbit#FFFFFF and Satellite#D9D9D9 remain authoritative, with required success/warning semantics. The stronger landing uses radial/diagonal light, orbital geometry, a two-line headline, hairline divider and one CTA. All visuals are editable CSS; no new dependency, bitmap or replacement logo was added.

Motion uses bounded160ms Web Animations exits plus shared CSS entrances, staged content, focus/hover/press, navigation indicators and actual pipeline classes. The document router and destinations remain unchanged. Only unmodified plain same-origin non-API links participate; download/target/modifier/hash/external links remain native. Auth redirects delegate their existing destination to the same presentation helper; HTTP contracts and role logic are unchanged. No numerical simulation or fake workload is introduced. Removed notices retain visuals200ms while immediately losing announcement roles and becoming aria-hidden/inert; active notices never auto-dismiss. OS and saved application reduced motion stop animations and hover transforms. Native dialog CSS does not introduce a modal or change the existing inline inspector.

## Verified evidence

- Final frontend typecheck/build passed.
- Focused React coverage:35 passed across6 files, including auth forms, notices, worker choice, landing and compilation feedback.
- Actual Edge: one CTA to/login, keyboard skip, widths320/390/768/1024/1440/1920, short1024x600,200%zoom, no horizontal overflow, OS and saved reduced-motion checks. Desktop/mobile previews: .runtime/design/landing-desktop.png and landing-mobile.png.
- Production backend-config defaults offline in the current baseline; it is unchanged. Auth test coverage explicitly supplies connected configuration while replacing transport. Real isolated integration selects its own loopback frontend/API/WS destination only in the fixture.
- Initial unconfigured auth suite failed11expectations due that baseline offline mode, then one relativeURL assertion failed with remote configuration. The suite now isolates connected configuration and all14auth tests pass.
- Real web attempt e9e2ac43e2a12a48 passed auth/enrollment/browser task/C, then Python download wait failed despite artifact GET200; logs confirm HMR and duplicate root initialization during edits. Attempt78a4e06fa197ab52 additionally passed Python but Java admission returned409; node eligibility loss is not proven to be a UI regression. Owned native logs were previously discarded. The fixture now records redacted worker lifecycle evidence, checks readiness immediately before admission and asserts actual POST responses. Final frozen run090d7f817d872d9a is pending; neither earlier attempt is called a pass.

## Design-tool artifacts

Arena:2competitors,1round,7calls; a002 won90–87.5 with Systems thinking / Draft, critique, rewrite / Clarity above all. Survived checks covered semantic child text, reduced-motion backdrops and active navigation. Full local record: .arena/run-20261120-195525-s283579/ . Implementation was explicitly authorized by the user.

Figma: https://www.figma.com/design/HvoOmv7RLj4ojUwv2jVjRl . Scoped palette/action family:4primitives,3semantic aliases, spacing/radius, shared typography,3bound action variants and review instances. Scopes, CSS syntax, bindings, bounds and screenshots verified. A separate perspective study uses a transparent intermediate plane. This is not a full application library or animation timeline. State IDs retained locally in.runtime/design/figma-state.json.

Imagegen was considered but responsive gradients/orbits fit its code-native exception; no generated raster or paid image API was used. Cross-document transition reference: https://developer.chrome.com/docs/web-platform/view-transitions/cross-document

No backend, database, native-worker or cloud-deployment changes belong to this presentation work. Existing Docker/project data is preserved; no deployment was run.

Native cross-document transitions were reproduced failing with InvalidStateError on ordinary Edge navigation, including with a static stylesheet. The unsuccessful native bootstrap/cancellation experiments were removed rather than filtering errors. The final bounded exit helper produces zero errors on three repeated landing/login navigations. Generation ownership prevents canceled transitions from issuing stale navigation; reduced motion and unavailable Web Animations navigate directly, animation exceptions recover, and BFCache/page return restores interaction. Run090d7f817d872d9a passed real C/Python/Java success/download and located failures before its final error assertion caught the native transition issue; it remains a failed overall run. Final helper acceptance is d843b35c3e9f27cd, currently pending.

## Final acceptance

Final isolated MySQL/Fastify/Edge run d843b35c3e9f27cd exited0 (summary inspected independently). Signup/login/reset/logout, role redirects, admin RBAC/actions, existing settings, reusable enrollment, browser portable-task result, real native C/Python/Java compilation/report/download, and all three persisted/rendered line3 failures passed. Its final browser-error assertion passed. Fixture-owned container was removed; developer data was not used or reset.

Final focused run:61tests across7files passed. Final frontend typecheck/build and responsive/reduced-motion checks passed. Independent review approved the final diff and confirmed no backend/packages/infra changes. Only the auth redirect presentation call delegates to the bounded motion helper; role decisions, requests, response handling and destinations are untouched. Test configuration/logging changes are limited to connected isolated acceptance and do not alter product deployment configuration.

Delivery: local source commit only. Public deployment is held; Git push is not performed because this repository is connected to Vercel and may publish on push. No Vercel, Kubernetes or Docker application deployment was run for this visual work. The existing isolated Docker test container was created and removed by the acceptance runner.
