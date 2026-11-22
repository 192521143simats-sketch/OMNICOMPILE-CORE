# OmniCompile Core production platform

## Architecture

OmniCompile Core has one React/Vite application, one Fastify coordinator, browser/native worker clients, shared compiler packages, and one authoritative MySQL database. Authentication uses server-side sessions represented by Secure-in-production, HttpOnly, SameSite cookies. The coordinator—not the frontend—enforces ADMIN/USER authorization and artifact ownership.

The domain model separates:

- `distributed_networks`: named, status/expiry/node-limit bounded scheduling domains with a hashed reusable join token.
- `network_enrollments`: one consent and revocable scoped credential per device.
- `nodes`: one browser/native worker identity per enrollment, attached to exactly one network.
- `tasks` and `task_attempts`: network-scoped work with immutable attempt history and bounded retries.
- `compilation_jobs` and `artifacts`: user-owned, network-associated compilation state and downloadable bytes.

Every scheduling query filters nodes by the task's `network_id`; assignment updates additionally require matching network IDs transactionally. Results must match the assigned node, task, and attempt. Workers from one network cannot receive another network's tasks.

## Authentication

Users register with name/email/password. Passwords are Argon2id hashes. Admin identity is bootstrapped from `ADMIN_USERNAME` plus preferably `ADMIN_PASSWORD_HASH`; `ADMIN_PASSWORD` is development fallback only. Login creates a random session token, stores only its SHA-256 representation in MySQL, and sends the raw token solely in an HttpOnly cookie. Logout/revocation and password reset invalidate sessions.

Password reset tokens are random, short-lived, single-use, and hash-only in MySQL. Without SMTP, development mode returns a local reset link after the same non-enumerating response. Production must connect an email provider and must not return that link in the response.

## Worker types

`BROWSER_WORKER` runs inside a Web Worker. It advertises IR optimization, static analysis, and browser-safe computation. It never claims or attempts GCC, CPython, Java, shell, or operating-system execution. Mobile browsers can suspend tabs, so lost heartbeats cause attempt interruption and requeue.

`NATIVE_WORKER` retains real local C/Python/Java toolchain profiling and compiler execution. It connects with a network/enrollment-scoped bearer credential in the WebSocket handshake header—not a URL. Windows packaging produces local installer/application outputs rather than committed binaries. The inspected Windows setup is currently unsigned; release signing and clean-machine installation remain acceptance gates. Local host execution does not automatically have the broker's container isolation and requires additional protection before handling hostile public submissions.

The Android application is native Kotlin/Jetpack Compose with minSdk 25. It contributes supported portable tasks and does not claim local GCC, CPython or JDK execution. The API-25 physical device has passed actual mixed-network enrollment, concurrent task execution, verification and restart recovery; that does not establish fresh API-26+ device coverage or production release signing.

## Compiler truthfulness

C uses the custom lexer/parser/semantic model, lowers supported functions into OmniCompile Core IR, distributes eligible optimization work, validates and aggregates candidates, emits C, and invokes GCC for the final native artifact. Browser workers may perform supported IR operations. Cloud GCC runs through the isolated execution broker, not inside the coordinator; explicitly enabled native workers may use discovered local toolchains.

Python uses CPython AST/compiler machinery and produces genuine `.pyc`; Java uses JDK `javac`, `javap`, and `jar` and produces genuine JARs. Cloud operations use their separate isolated toolchain images; local operations require compatible native workers. Browser/Android portable participation does not imply local CPython/JDK compilation.

## Database migration

Startup performs additive, idempotent MySQL migration for users, auth sessions, reset tokens, networks, enrollments, audit events, ownership/network columns, foreign keys, and indexes. Existing compiler/job data is preserved. Historical `sessions`/`invitations` tables remain only as compatibility history for pre-network installations and are not used by current routes or services. No SQLite code, dependency, or runtime file is present.
