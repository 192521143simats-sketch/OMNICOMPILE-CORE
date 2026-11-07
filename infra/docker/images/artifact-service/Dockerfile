FROM chrislusf/seaweedfs:4.52@sha256:57877e32bb90073b37dc109b438ba66e84fd5ed9ced5f5c04f56444ef243ce59
USER root
RUN mkdir -p /data && chown 1000:1000 /data
COPY --chmod=755 infra/docker/images/artifact-service/entrypoint.sh /usr/local/bin/omnicompile-artifacts
LABEL com.omnicompile.project="omnicompile" com.omnicompile.role="artifacts"
USER 1000:1000
EXPOSE 9000
ENTRYPOINT ["/usr/local/bin/omnicompile-artifacts"]
