# The coordinator service context supplies the identical audited application layer.
FROM docker:29-cli@sha256:2357639ad1ea7d0194134bf3292622fd4e562483966ed674e5d7c945b5f3b28d AS docker-cli
FROM coordinator
USER root
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
LABEL com.omnicompile.project="omnicompile" com.omnicompile.role="executor"
ENV DOCKER_CONFIG=/tmp/docker
EXPOSE 4102
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=18 CMD node -e "fetch('http://127.0.0.1:4102/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","--import","tsx","apps/coordinator/src/docker-executor.ts"]
