# Workspace packages export TypeScript source; retain tsx deliberately.
FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS build
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/compiler-c/package.json ./packages/compiler-c/package.json
COPY packages/compiler-java/package.json ./packages/compiler-java/package.json
COPY packages/compiler-python/package.json ./packages/compiler-python/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/orchestration/package.json ./packages/orchestration/package.json
COPY apps/coordinator/package.json ./apps/coordinator/package.json
RUN npm ci --workspace=@omnicompile/coordinator --include-workspace-root=true
COPY packages ./packages
COPY apps/coordinator ./apps/coordinator
COPY scripts/Copy-Coordinator-Migrations.mjs ./scripts/Copy-Coordinator-Migrations.mjs
RUN npm run build -w @omnicompile/coordinator
# Runtime retains TypeScript package exports and tsx, but not Electron, Vitest,
# TypeScript build tooling or the root workspace's development dependency tree.
# A clean install is necessary: workspace-scoped prune retains unrelated packages.
RUN npm ci --omit=dev --workspace=@omnicompile/coordinator --include-workspace-root=false \
    && test ! -d node_modules/electron && test ! -d node_modules/vitest \
    && node --import tsx -e "Promise.all(['@omnicompile/compiler-c','@omnicompile/compiler-python','@omnicompile/compiler-java','@omnicompile/contracts','@omnicompile/orchestration','argon2'].map(name=>import(name)))"

FROM python:3.14-slim-trixie@sha256:a2b82f3c48559aa0a8446d9af49826b6e2b2016f4cd2afabfe6013ec53729170
# Match the authoritative verifier's Python/JDK generation to the sandbox and
# supported native-worker source syntax. Node is copied from the pinned build.
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev openjdk-21-jdk-headless && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1000 node && useradd --uid 1000 --gid node --create-home --shell /bin/sh node
COPY --from=build /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=build --chown=node:node /app /app
COPY --chmod=755 infra/containers/coordinator-entrypoint.sh /usr/local/bin/omnicompile-start
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4100
USER node
EXPOSE 4100
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=6 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/ready',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["/usr/local/bin/omnicompile-start"]
