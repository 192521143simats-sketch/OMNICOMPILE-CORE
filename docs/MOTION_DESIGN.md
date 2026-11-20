# Cinematic landing and web motion

The public entry is implemented by `apps/web/src/landing.tsx` and `landing.css`. It retains one GET STARTED link to the existing `/login` route; guest Login navigation is absent on `/login` and `/signup`. Authentication, administrator permissions, enrollment, compiler state and API contracts remain unchanged.

The shared Shell, `motion.css`, `motion.tsx` and `navigation-motion.ts` provide bounded 160ms navigation exits, CSS entrances, interaction feedback and actual pipeline-state styling. Modified, external, download, API and same-page hash links retain native behavior. Reduced-motion settings disable ambient motion and transforms; no simulated workload or metrics are introduced.

The landing retains the existing wordmark, carbon/coral/white/silver palette, orbital geometry and infrastructure footer. The redundant Windows/Web/Android sentence was removed. Edge verified zero horizontal or vertical overflow and a fully visible footer at 320x568, 390x667, 390x844, 768x1024, 1024x600, 1440x900 and 1920x1080. Accessibility zoom may require scrolling rather than clipping controls.

## Verification

- Focused landing/navigation/authentication/notice regressions: 47 tests passed; frontend typecheck and production build passed.
- Earlier full presentation acceptance: 61 tests across seven files passed. Isolated MySQL/Fastify/Edge run `d843b35c3e9f27cd` exited 0 for signup/login/reset/logout, RBAC, settings, enrollment, browser portable work, native C/Python/Java compilation/report/download and persisted/rendered line-3 failures. This is historical scoped evidence, not a new current full-system run or native/cloud release acceptance.
- Existing `scripts/Verify-Web-Product.mjs` retains the regression flow and seven viewport/footer checks. Reproduce using `npm run verify:web`; it creates its own isolated fixtures. Historical screenshots, profiles, Arena records and Figma scratch state are disposable outputs and are not runtime dependencies.
- Figma design: https://www.figma.com/design/HvoOmv7RLj4ojUwv2jVjRl . CSS remains authoritative; no raster assets or additional runtime dependency are required.

Current release gaps and delivery status are maintained in `docs/EXPECTED_CROSSCHECK.md`. A public frontend alone does not establish connectivity to a public backend. OCI deployment remains held pending the user's infrastructure details and approval.
