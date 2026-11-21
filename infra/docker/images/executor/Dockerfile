# The coordinator service context supplies the identical audited application layer.
FROM docker:29-cli@sha256:34507eb5069d8be82c95dd3b6987d4250fd5fee49b82e2509b7d7a7030740d6d AS docker-cli
FROM coordinator
USER root
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
LABEL com.omnicompile.project="omnicompile" com.omnicompile.role="executor"
ENV DOCKER_CONFIG=/tmp/docker
EXPOSE 4102
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=18 CMD node -e "fetch('http://127.0.0.1:4102/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","--import","tsx","apps/coordinator/src/docker-executor.ts"]
