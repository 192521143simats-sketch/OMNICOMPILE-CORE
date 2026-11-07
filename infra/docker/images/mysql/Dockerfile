# Project-specific configuration; the general-purpose MYSQL container uses the
# upstream mysql:8.4 image independently of this build.
FROM mysql:8.4@sha256:a0225d1ea6631c8bc2385dc4c2faba17bbf1834ecf369e1659a9a382bd8d5dd7
LABEL com.omnicompile.project="omnicompile" \
      com.omnicompile.role="database" \
      org.opencontainers.image.title="OmniCompile Core MySQL"
EXPOSE 3307
HEALTHCHECK --interval=5s --timeout=5s --start-period=30s --retries=30 CMD MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --protocol=TCP --host=127.0.0.1 --port=3307 --user=root --execute='SELECT 1' "$MYSQL_DATABASE" >/dev/null 2>&1
CMD ["mysqld", "--port=3307", "--bind-address=0.0.0.0", "--mysqlx=OFF"]
