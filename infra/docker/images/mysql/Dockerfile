# Project-specific configuration; the general-purpose MYSQL container uses the
# upstream mysql:8.4 image independently of this build.
FROM golang:1.27.4@sha256:205c7636d74e0ffbe3d007162df7d74f859f5a8c8322dfb9f907977686c126cf AS gosu-build
ENV CGO_ENABLED=0 GOTOOLCHAIN=local
RUN go install github.com/tianon/gosu@1.19

FROM mysql:8.4@sha256:a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902
# OmniCompile uses the server and mysql CLI, never the optional mysqlsh/Python
# administration tool. Remove that package through RPM, retaining package metadata.
RUN microdnf remove -y mysql-shell \
    && microdnf upgrade -y \
    && microdnf clean all \
    && mysql --version && mysqld --version
COPY --from=gosu-build /go/bin/gosu /usr/local/bin/gosu
RUN gosu nobody true
LABEL com.omnicompile.project="omnicompile" \
      com.omnicompile.role="database" \
      org.opencontainers.image.title="OmniCompile Core MySQL"
EXPOSE 3307
HEALTHCHECK --interval=5s --timeout=5s --start-period=30s --retries=30 CMD MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --protocol=TCP --host=127.0.0.1 --port=3307 --user=root --execute='SELECT 1' "$MYSQL_DATABASE" >/dev/null 2>&1
CMD ["mysqld", "--port=3307", "--bind-address=0.0.0.0", "--mysqlx=OFF"]
