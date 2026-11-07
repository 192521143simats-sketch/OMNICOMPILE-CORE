FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS build
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/compiler-c/package.json ./packages/compiler-c/package.json
COPY packages/compiler-java/package.json ./packages/compiler-java/package.json
COPY packages/compiler-python/package.json ./packages/compiler-python/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/orchestration/package.json ./packages/orchestration/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --workspace=@omnicompile/web --include-workspace-root=true
COPY packages ./packages
COPY apps/web ./apps/web
RUN npm run build -w @omnicompile/web

FROM nginxinc/nginx-unprivileged:1.28-alpine@sha256:7377697a821c131a924a7105fafbe7414db4e9fcc77a6f08f776f33f141ec3f8
COPY infra/docker/images/frontend/nginx.conf /etc/nginx/templates/default.conf.template
COPY --chmod=755 infra/docker/images/frontend/15-omnicompile-dns.envsh /docker-entrypoint.d/15-omnicompile-dns.envsh
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
USER 101
ENV COORDINATOR_UPSTREAM=coordinator:4100
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=6 CMD wget --quiet --spider http://127.0.0.1:8080/healthz || exit 1
