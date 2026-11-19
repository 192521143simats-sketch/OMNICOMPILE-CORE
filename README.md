# OmniCompile Core

A Zero-Trust, Fault-Tolerant Distributed Compiler Pipeline for Heterogeneous Edge-to-Cloud Orchestration.

**Production Frontend URL:** [https://omnicompile-core-platform.vercel.app](https://omnicompile-core-platform.vercel.app)

---

## Architecture Overview

OmniCompile Core is a distributed resource-aware compilation and optimization platform supporting C, Python, and Java. It decouples compilation workloads and distributes them across heterogeneous worker nodes using resource-aware scheduling.

### Core Modules

- **Coordinator (`apps/coordinator`):** Central orchestration engine managing worker enrollment, sessions, heartbeats, job scheduling, and artifact generation.
- **Frontend (`apps/web`):** React 19 / Vite single-page application providing user compilation workspace, administrator dashboard, and unified worker network management.
- **Compiler Pipelines (`packages/compiler-*`):** Independent compiler frontends and analysis engines for C, Python, and Java.
- **Worker Infrastructure (`apps/windows-worker`, `apps/android-worker`, `apps/web`):** Cross-platform worker agents supporting Windows, Android, and browser execution.
- **Execution Broker (`infra/kubernetes`):** Ephemeral isolated execution environments utilizing secure OCI containers with strict resource and network isolation.

---

## Quick Start & Local Development

### Prerequisites
- Node.js 24+ / npm 10+
- Docker Desktop with Kubernetes enabled
- MySQL 8.4+

### Installation & Startup
```bash
# Install dependencies
npm ci

# Start local development (Coordinator + Web)
npm run dev

# Start local Docker stack
docker compose up -d
```

---

## Verification & Testing

```bash
# Run complete test suite (Vitest + Node tests)
npm run verify

# Run isolated integration verifiers
npm run verify:integration
npm run verify:execution
```

---

## License & Project Status

OmniCompile Core is developed as a senior software engineering capstone project demonstrating distributed systems, zero-trust security, container orchestration, and compiler systems engineering.
