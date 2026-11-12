# OmniCompile Core native Android worker

The current application identity is `org.omnicompile.worker`, with a separate
Android Keystore namespace and worker protocol version 2. This intentionally does
not import credentials from the former application: install the new package and
explicitly enroll using the current coordinator's link. Earlier physical-device
evidence below is historical and does not certify this renamed package on a phone.

Native task contribution has passed physical Android 10 acceptance against an
isolated coordinator/MySQL fixture. See docs/engineering/PHASE8_VERIFICATION.md
for exact evidence and release boundaries; this is not a signed production release.

The app uses the permanent high-contrast carbon/coral product palette, including
readable native window/system-bar colors under either device light/dark setting.
Android force-dark is disabled where supported to avoid double inversion.

Wrapper provenance: Gradle v8.13.0 upstream scripts and wrapper JAR. JAR SHA-256
81a82aaea5abcc8ff68b3dfcb58b3c3c429378efd98e7433460610fecd7ae45f
matched the upstream published checksum during pre-flight. Distribution checksum
is enforced by gradle-wrapper.properties.

## Reproducible local build

Use JDK 21 (not Android Studio's JDK 25 with Gradle 8.13), Android SDK platform36
and build-tools36.0.0. Configure ANDROID_HOME externally or ignored local.properties.

```powershell
$env:JAVA_HOME='C:/Program Files/Java/jdk-21.0.12.1'
$env:ANDROID_HOME='D:/Android/Sdk'
./gradlew.bat :app:testDebugUnitTest :app:assembleDebug :app:assembleRelease :app:bundleRelease --no-daemon
```

Debug APK: app/build/outputs/apk/debug/app-debug.apk. Release output is unsigned
unless an explicit external signing identity is configured. Never publish a debug
APK as a production-signed application. No signing credentials belong in Git.

## Permissions and trust boundaries

INTERNET: coordinator API/WebSocket; ACCESS_NETWORK_STATE: contribution policy.
FOREGROUND_SERVICE/SPECIAL_USE: user-initiated visible distributed contribution;
POST_NOTIFICATIONS: ongoing contribution controls on supported versions.
No contacts, microphone, location, external storage or shell execution is needed.
Special-use foreground service distribution requires platform/store review; this
repository cannot promise that review's outcome. No automatic boot contribution.

Release traffic requires HTTPS/WSS with ordinary certificate validation. Debug
supports explicit development HTTP including ADB reverse; credentials on HTTP
are unsuitable for an untrusted network. Localhost on a phone means the phone,
not the PC, unless a specific ADB reverse mapping exists.

Only bounded allowlisted portable tasks can execute natively. Android is not a
desktop GCC/CPython/JDK host. Results are checked by the coordinator; neither
task completion nor compilation artifacts are fabricated by the Android UI.

## Android version compatibility

The worker supports Android 7.1 (API 25) and later. API 25 starts contribution
from the visible activity using the legacy service entry point and shows a
low-priority foreground notification. Android 8 and later use a foreground
service start and a notification channel. Android 13 and later retain the
notification permission prompt.

Gradle core-library desugaring supplies Java time APIs for telemetry on API 25.
The worker uses the same enrollment, authentication, WebSocket and task protocol
on all supported versions. Production connections still require HTTPS/WSS with
system certificate validation. Older devices need a system trust store that
trusts the endpoint's certificate chain. Thermal telemetry is available from
API 29. On API 25–28 the app reports thermal telemetry as unavailable and does not request thermal protection from the scheduler. Wi-Fi, battery, foreground and workload limits still apply.

Physical API 25 acceptance on the Redmi Y1 Lite verified the installed APK
digests, foreground notification, three-worker enrollment, accepted task
results, reassignment, reconnect and leave. The device needed an explicit
foreground activity launch during its instrumentation startup. Use the
isolated acceptance package for these tests to preserve the normal app's
enrollment.
