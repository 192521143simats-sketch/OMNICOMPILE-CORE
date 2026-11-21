# Shared source/dependency layer, followed by independent language runtime targets.
FROM node:24-alpine3.24@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS build
WORKDIR /app
RUN apk upgrade --no-cache && apk add --no-cache gcc musl-dev linux-headers
COPY infra/docker/images/workers/compiler-sandbox.c /tmp/compiler-sandbox.c
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

FROM node:24-alpine3.24@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS c-worker
RUN apk upgrade --no-cache && apk add --no-cache gcc g++ musl-dev make cmake
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
WORKDIR /app
COPY --from=build --chown=node:node /app /app
COPY --from=build /usr/local/bin/omnicompile-compiler-sandbox /usr/local/bin/omnicompile-compiler-sandbox
ENV OMNICOMPILE_WORKER_LANGUAGE=c OMNICOMPILE_COMPILER_LANGUAGE=c
ENV OMNICOMPILE_COMPILER_SANDBOX_EXECUTABLE=/usr/local/bin/omnicompile-compiler-sandbox
USER node
EXPOSE 4101
CMD ["node", "--import", "tsx", "apps/coordinator/src/compiler-service.ts"]

FROM python:3.14-alpine3.24@sha256:5862d971d1f0ae26b258cefa4e893556b1d3aba81bd2ff30888704ad378bab67 AS python-worker
# Jobs run the prebuilt standard-library toolchain and never install packages.
# Uninstall the unused installer itself, including its vulnerable vendored code.
RUN python -m pip uninstall --yes pip
RUN apk upgrade --no-cache && apk add --no-cache libstdc++ && addgroup -g 1000 node && adduser -D -u 1000 -G node node
COPY --from=build /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=build --chown=node:node /app /app
COPY --from=build /usr/local/bin/omnicompile-compiler-sandbox /usr/local/bin/omnicompile-compiler-sandbox
ENV OMNICOMPILE_WORKER_LANGUAGE=python OMNICOMPILE_COMPILER_LANGUAGE=python
ENV OMNICOMPILE_COMPILER_SANDBOX_EXECUTABLE=/usr/local/bin/omnicompile-compiler-sandbox
USER node
EXPOSE 4101
CMD ["node", "--import", "tsx", "apps/coordinator/src/compiler-service.ts"]

FROM alpine:3.24@sha256:f59abe656b692d901e184be3445e084786602108599d2a51d229c0f5a48c71bf AS java-worker
# Keep JDK21 and report its actual detected patch version.
RUN apk upgrade --no-cache && apk add --no-cache openjdk21-jdk libstdc++ && addgroup -g 1000 node && adduser -D -u 1000 -G node node
COPY --from=build /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=build --chown=node:node /app /app
COPY --from=build /usr/local/bin/omnicompile-compiler-sandbox /usr/local/bin/omnicompile-compiler-sandbox
ENV OMNICOMPILE_WORKER_LANGUAGE=java OMNICOMPILE_COMPILER_LANGUAGE=java
ENV OMNICOMPILE_COMPILER_SANDBOX_EXECUTABLE=/usr/local/bin/omnicompile-compiler-sandbox
USER node
EXPOSE 4101
CMD ["node", "--import", "tsx", "apps/coordinator/src/compiler-service.ts"]
