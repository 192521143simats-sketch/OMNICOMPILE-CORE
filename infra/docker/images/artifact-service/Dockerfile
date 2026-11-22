FROM chrislusf/seaweedfs:4.54@sha256:4b42c212543a0acd4c0e675215ecdcaf62a186ef98def76c7e12701871222d15
USER root
RUN mkdir -p /data && chown 1000:1000 /data
COPY --chmod=755 infra/docker/images/artifact-service/entrypoint.sh /usr/local/bin/omnicompile-artifacts
LABEL com.omnicompile.project="omnicompile" com.omnicompile.role="artifacts" \
      org.opencontainers.image.source="https://github.com/192521143simats-sketch/OMNICOMPILE-CORE"
USER 1000:1000
EXPOSE 9000
ENTRYPOINT ["/usr/local/bin/omnicompile-artifacts"]
