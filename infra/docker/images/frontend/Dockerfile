FROM node:24-alpine3.24@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS build
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
ENV VITE_BACKEND_MODE=remote VITE_API_BASE_URL=same-origin
RUN npm run build -w @omnicompile/web

FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03
LABEL org.opencontainers.image.source="https://github.com/192521143simats-sketch/OMNICOMPILE-CORE"
USER root
# Upstream optional modules pin the old nginx ABI; our proxy uses none of them.
# Preserve the unprivileged paths while replacing the actual server package.
RUN cp /etc/nginx/nginx.conf /tmp/omnicompile-nginx.conf \
    && apk del nginx-module-geoip nginx-module-image-filter nginx-module-njs nginx-module-xslt nginx \
    && apk add --no-cache 'nginx>=1.30.7-r0' \
    && cp /tmp/omnicompile-nginx.conf /etc/nginx/nginx.conf \
    && rm /tmp/omnicompile-nginx.conf \
    && apk upgrade --no-cache
COPY infra/docker/images/frontend/nginx.conf /etc/nginx/templates/default.conf.template
COPY --chmod=755 infra/docker/images/frontend/15-omnicompile-dns.envsh /docker-entrypoint.d/15-omnicompile-dns.envsh
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
USER 101
ENV COORDINATOR_UPSTREAM=coordinator:4100
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=6 CMD wget --quiet --spider http://127.0.0.1:8080/healthz || exit 1
