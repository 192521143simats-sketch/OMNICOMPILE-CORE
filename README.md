# OmniCompile Core

**OmniCompile Core: A Zero-Trust, Fault-Tolerant Distributed Compiler Pipeline for Heterogeneous Edge-to-Cloud Orchestration.**

**Production Frontend URL:** [https://omnicompile-core-platform.vercel.app](https://omnicompile-core-platform.vercel.app)

---

## System Architecture & Implementation

OmniCompile Core combines real C, Python, and Java compiler pipelines with a centralized coordinator that assigns eligible optimization and compute tasks to heterogeneous workers. It adapts scheduling to device capabilities and recovers from worker failures while preserving compilation outputs and task traceability.

### Key Modules & Directory Structure

```text
OmniCompile Core/
├── apps/
│   ├── coordinator/        # Central orchestration API server & WebSocket gateway
│   ├── web/                # React 19 / Vite frontend (Hosted on Vercel)
│   ├── windows-worker/     # Electron Windows native worker application
   ├── android-worker/     # Kotlin & Jetpack Compose Android native worker
│   └── worker/             # Shared worker execution agent runtime
├── packages/
│   ├── compiler-c/         # C compiler frontend, lexer, parser & IR
│   ├── compiler-python/    # Python compilation & static analysis
│   ├── compiler-java/      # Java compilation & bytecode generator
│   ├── contracts/          # Shared type definitions & protocol schemas
│   └── orchestration/      # Distributed scheduler & execution logic
├── infra/
│   ├── docker/             # Docker Compose & container images (GCC, Python, JDK)
│   ├── kubernetes/         # Production OKE / Kubernetes manifests & overlays
│   └── vercel/             # Vercel SPA routing configuration & Caddy gateway
├── samples/                # Reference test source programs (C, Python, Java)
└── scripts/                # Environment initialization & automated test verifiers
```

---

## How It Works

1. **Unified Network Enrollment:** An administrator creates an isolated network and shares its secure enrollment link (`/join/<token>`). Peers explicitly consent to join through a browser, Windows desktop app, or native Android app.
2. **Resource-Aware Scheduling:** Workers advertise supported operations, capabilities, and system resources via a versioned WebSocket protocol. Heartbeats maintain live node availability.
3. **Language-Specific Compilation:** Users select a language and submit source (pasted or uploaded). The dedicated compiler frontend analyzes the program and decomposes independent work into bounded tasks.
4. **Distributed Execution:** Workers execute authorized tasks. The coordinator verifies task, worker, and attempt identity before aggregating results. Interrupted attempts are automatically retried.
5. **Artifact Delivery:** The platform generates language-appropriate artifacts (`.exe`, bytecode, `.jar`) accompanied by structured diagnostics and operational metrics.

---

## Quick Start & Local Deployment

### Prerequisites
- Docker Desktop with Kubernetes enabled
- Node.js 24+ / npm 10+
- MySQL 8.4+

### Startup
```bat
START-OMNICOMPILE.bat
```
Open `http://localhost:5173`. On initial startup, a random `ADMIN_PASSWORD` is written to `.env`; sign in with `ADMIN_USERNAME` and that password.

### Shutdown
```bat
STOP-OMNICOMPILE.bat
```
Preserves persistent database and artifact volumes.

---

## Production Deployment (Vercel & OKE)

- **Frontend:** Hosted on Vercel Hobby plan at [omnicompile-core-platform.vercel.app](https://omnicompile-core-platform.vercel.app) with SPA fallback routing (`vercel.json`) and offline/remote mode switching.
- **Backend:** Configured for local Docker/Kubernetes and prepared for Oracle Cloud Infrastructure (OCI) / Oracle Kubernetes Engine (OKE) free tier.

---

## Verification & Testing

```powershell
npm run verify
npm run verify:integration
npm audit
```

See [Master Build Specification](OMNICOMPILE_MASTER_BUILD_SPEC.md), [Security Policy](SECURITY.md), [Implementation Ledger](docs/engineering/IMPLEMENTATION_LEDGER.md), and [Requirements Traceability](docs/engineering/REQUIREMENTS_TRACEABILITY.md).
