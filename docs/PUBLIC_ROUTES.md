# Public page and backend routes

Public origin: https://omnicompile-core-platform.vercel.app

| Page path | Page name | Backend connection / access |
|---|---|---|
| `/` | OmniCompile Core | Static landing page; Get Started opens `/login` |
| `/login` | Sign in | `POST /api/auth/login`; role selects admin or compiler dashboard |
| `/signup` | Create account | `POST /api/auth/signup`; then sign in |
| `/forgot-password` | Request password reset | `POST /api/auth/forgot-password`; delivery depends on configured email provider |
| `/reset-password?token=…` | Choose a new password | `POST /api/auth/reset-password`; requires valid unexpired token |
| `/admin` | Administration | Admin-only `/api/admin/*`, settings, artifact APIs and authenticated realtime snapshots |
| `/dashboard` | Compiler dashboard | User-only compilation submission/history/metrics; authenticated reports and downloads |
| `/worker` | Worker platforms | Platform selection or invitation inspection when `?token=…` is supplied |
| `/web-worker` | Web worker | Browser invitation/consent, approval, `/api/worker/*`, realtime ticket and portable task transport |
| `/windows-worker` | Windows worker | Invitation inspection and scoped package authorization; native app instructions |
| `/android-worker` | Android worker | Invitation inspection and scoped package authorization; native app instructions |
| `/join/:token` | Join a distributed network | `GET /api/join/:token`; supplies platform choices |
| `/join/:token/web` | Web worker enrollment | Existing invitation link remains supported |
| `/join/:token/windows` | Windows worker enrollment | Existing invitation link remains supported |
| `/join/:token/android` | Android worker enrollment | Existing invitation link remains supported |

Platform pages carry an invitation as `?token=…`; the page itself grants no
enrollment or compute authorization. Registration, consent, approval, credentials
and resource policy remain backend responsibilities. Native package availability
and signing status are shown by the existing authorization flow.

`/browser-worker` redirects to `/web-worker` while preserving query and fragment.
Trailing slashes redirect to the canonical page path. Retired `/settings` and
`/compute` bookmarks redirect to `/dashboard`, retaining the compiler-only user
workspace rather than reviving removed features. Admin tabs and job/task/node
inspectors remain inside `/admin`; they are not nonexistent standalone pages.

Each supported page has a descriptive browser title. Unknown page paths return
HTTP404 and a Page not found view, rather than displaying the landing page.
Unknown `/api/*` routes reach the backend and return JSON404; they never fall back
to the SPA. Unauthenticated protected APIs return JSON401, and role checks remain
on the coordinator.

HTTP APIs and browser cookies use the Vercel origin. Browser realtime obtains a
30-second, single-use authorization ticket from `/api/realtime/ticket`, then opens
direct WSS to the laptop backend. Existing native apps use the backend invitation
shown on their installation page. Vercel's HTTP rewrite is not claimed to support
WebSocket upgrades. Keeping pages on Vercel does not move compute off the laptop.

Read-only production route checks: `node scripts/Verify-Public-Routes.mjs`.
The audit checks direct navigation, titles, canonical paths, not-found responses,
and representative backend authentication/404 responses without creating users,
jobs, enrollments or artifacts. Evidence is stored under ignored
`.runtime/online-demo/page-route-audit.json`.
