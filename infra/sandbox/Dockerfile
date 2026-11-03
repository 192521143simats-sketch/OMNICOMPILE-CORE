FROM python:3.14-slim-trixie@sha256:a2b82f3c48559aa0a8446d9af49826b6e2b2016f4cd2afabfe6013ec53729170
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev openjdk-21-jre-headless && rm -rf /var/lib/apt/lists/*
COPY runner.py /opt/omnicompile/runner.py
COPY kubernetes-entry.py /opt/omnicompile/kubernetes-entry.py
USER 0:0
WORKDIR /work
ENTRYPOINT ["python3", "-I", "/opt/omnicompile/runner.py"]
