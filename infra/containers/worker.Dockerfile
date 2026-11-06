# Shared source/dependency layer, followed by independent language runtime targets.
FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev linux-libc-dev && rm -rf /var/lib/apt/lists/*
COPY infra/containers/compiler-sandbox.c /tmp/compiler-sandbox.c
RUN gcc -O2 -Wall -Wextra -Werror -o /usr/local/bin/omnicompile-compiler-sandbox /tmp/compiler-sandbox.c
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/compiler-c/package.json ./packages/compiler-c/package.json
COPY packages/compiler-java/package.json ./packages/compiler-java/package.json
COPY packages/compiler-python/package.json ./packages/compiler-python/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/orchestration/package.json ./packages/orchestration/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY apps/coordinator/package.json ./apps/coordinator/package.json
RUN npm ci --omit=dev --workspace=@omnicompile/coordinator --workspace=@omnicompile/worker --include-workspace-root=false
COPY packages ./packages
COPY apps/worker ./apps/worker
COPY apps/coordinator/src ./apps/coordinator/src
RUN test ! -d node_modules/electron && test ! -d node_modules/vitest

FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS c-worker
RUN apt-get update && apt-get install -y --no-install-recommends gcc g++ libc6-dev make cmake && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app /app
COPY --from=build /usr/local/bin/omnicompile-compiler-sandbox /usr/local/bin/omnicompile-compiler-sandbox
ENV OMNICOMPILE_WORKER_LANGUAGE=c OMNICOMPILE_COMPILER_LANGUAGE=c
ENV OMNICOMPILE_COMPILER_SANDBOX_EXECUTABLE=/usr/local/bin/omnicompile-compiler-sandbox
USER node
EXPOSE 4101
CMD ["node", "--import", "tsx", "apps/coordinator/src/compiler-service.ts"]

FROM python:3.14-slim-trixie@sha256:a2b82f3c48559aa0a8446d9af49826b6e2b2016f4cd2afabfe6013ec53729170 AS python-worker
RUN groupadd --gid 1000 node && useradd --uid 1000 --gid node --create-home --shell /bin/sh node
COPY --from=build /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=build --chown=node:node /app /app
COPY --from=build /usr/local/bin/omnicompile-compiler-sandbox /usr/local/bin/omnicompile-compiler-sandbox
ENV OMNICOMPILE_WORKER_LANGUAGE=python OMNICOMPILE_COMPILER_LANGUAGE=python
ENV OMNICOMPILE_COMPILER_SANDBOX_EXECUTABLE=/usr/local/bin/omnicompile-compiler-sandbox
USER node
EXPOSE 4101
CMD ["node", "--import", "tsx", "apps/coordinator/src/compiler-service.ts"]

FROM debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2 AS java-worker
# JDK21 is supplied by Debian trixie; retain the toolchain's detected patch version in reports.
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-21-jdk-headless && rm -rf /var/lib/apt/lists/* && groupadd --gid 1000 node && useradd --uid 1000 --gid node --create-home --shell /bin/sh node
COPY --from=build /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=build --chown=node:node /app /app
COPY --from=build /usr/local/bin/omnicompile-compiler-sandbox /usr/local/bin/omnicompile-compiler-sandbox
ENV OMNICOMPILE_WORKER_LANGUAGE=java OMNICOMPILE_COMPILER_LANGUAGE=java
ENV OMNICOMPILE_COMPILER_SANDBOX_EXECUTABLE=/usr/local/bin/omnicompile-compiler-sandbox
USER node
EXPOSE 4101
CMD ["node", "--import", "tsx", "apps/coordinator/src/compiler-service.ts"]
