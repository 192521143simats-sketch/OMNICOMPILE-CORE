#!/bin/sh
set -eu
AWS_ACCESS_KEY_ID="$(cat /run/secrets/artifacts-access)"
AWS_SECRET_ACCESS_KEY="$(cat /run/secrets/artifacts-secret)"
test -n "$AWS_ACCESS_KEY_ID"
test -n "$AWS_SECRET_ACCESS_KEY"
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
export S3_BUCKET=omnicompile-artifacts
exec /usr/bin/weed mini -dir=/data -s3.port=9000 -admin.ui=false -s3.port.iceberg=0 -s3.port.lance=0
