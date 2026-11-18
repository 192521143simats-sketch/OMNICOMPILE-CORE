# Optional prewarmed execution pool

The standard Desktop and native overlays keep the pool disabled. Live Kubernetes pool acceptance is still pending. The pool provisions at most one pristine Pod per language, with an irreversible claim and single execution. Completed Pods are deleted. Idle Pods expire, and the existing two-execution admission bound applies.

Before enabling the pool, complete migration 0024 through the controlled migration process against the broker's database. Use a matching release of the coordinator image for the broker and the C, Python, and Java images containing the prewarmed runner. Verify the image digests, the configured RuntimeClass, and capacity for the five-Pod quota. Docker Desktop must be able to resolve the updated application image and the exact digests in the `execution-images` ConfigMap. Follow the [Docker Desktop runner refresh procedure](../kubernetes/README.md#docker-desktop-kubernetes) to verify that the node uses the intended images.

Render the overlays locally from the repository root.

```powershell
kubectl kustomize infra/kubernetes-desktop-prewarm
kubectl kustomize infra/kubernetes-desktop-prewarm-drain
kubectl kustomize infra/kubernetes-native-prewarm
kubectl kustomize infra/kubernetes-native-prewarm-drain
```

Run the offline overlay regression checks with `node --test infra/kubernetes/prewarm-overlays.test.mjs`. Set `OMNICOMPILE_KUBECTL` to the path to your kubectl executable if it is outside PATH.

## Pool policy

The opt-in prewarm overlays set `OMNICOMPILE_PREWARM_POLICY=demand`. With `OMNICOMPILE_PREWARM_ENABLED=1` and the policy unset or set to `fixed`, the broker maintains one warm Pod per language regardless of recent activity. Standard overlays disable prewarming entirely.

In demand mode the broker targets one warm Pod per language with a Kubernetes execution admitted in the preceding five minutes or an active execution reservation. The target drops to zero when demand expires. Scale-down retires only unclaimed idle Pods. Claimed Pods and in-flight provisioning leases follow their existing execution and cleanup paths.

The broker reads the `execution-capacity` ResourceQuota in the execution namespace before adding Pods. Each new warm Pod consumes one Pod, 250 millicores of requested CPU, and 256 MiB of requested memory from the reported headroom for that pass. When any quota value is missing, unsupported, or stale against the quota spec, or the read fails, the broker skips new warm Pods. Kubernetes quota admission remains the final enforcement point when concurrent workload changes invalidate a snapshot. Cold Jobs continue through the existing admission and fallback paths.

Quota usage describes namespace allocations for requested resources. CPU and memory utilization, node allocatable capacity, and actual schedulability require runtime measurements. Inspect the quota with `kubectl -n omnicompile-execution get resourcequota execution-capacity -o yaml` and compare its `status.hard` and `status.used` fields. Live validation of this policy is still pending.

## Docker Desktop rollout

Use this overlay in a working local cluster already configured with the Desktop baseline. The overlay uses the Desktop runc RuntimeClass and loopback port 15173. After completing the migration and image checks, the operator can enable the pool with these commands.

```powershell
kubectl --context docker-desktop apply -k infra/kubernetes-desktop-prewarm
kubectl --context docker-desktop -n omnicompile rollout status deployment/omnicompile-executor
```

Exercise C, Python, and Java jobs, ownership, cancellation, receipt replay, broker restart, idle expiry, and cleanup before considering the pool for cloud use.

## Disable and drain

The drain overlays stop new warm claims while retaining cleanup permissions and quota. On Docker Desktop, apply the drain overlay and check the rollout and labeled resources.

```powershell
kubectl --context docker-desktop apply -k infra/kubernetes-desktop-prewarm-drain
kubectl --context docker-desktop -n omnicompile rollout status deployment/omnicompile-executor
kubectl --context docker-desktop -n omnicompile-execution get pods -l omnicompile.io/prewarm-language
kubectl --context docker-desktop -n omnicompile-execution get configmaps -l omnicompile.io/prewarm-pod
```

In an environment based on the native overlay, use the native drain overlay and replace `NATIVE_CONTEXT` with that environment's Kubernetes context.

```powershell
kubectl --context NATIVE_CONTEXT apply -k infra/kubernetes-native-prewarm-drain
kubectl --context NATIVE_CONTEXT -n omnicompile rollout status deployment/omnicompile-executor
kubectl --context NATIVE_CONTEXT -n omnicompile-execution get pods -l omnicompile.io/prewarm-language
kubectl --context NATIVE_CONTEXT -n omnicompile-execution get configmaps -l omnicompile.io/prewarm-pod
```

Use the existing authorized MySQL administration connection to run this read-only check against the database used by the broker.

```sql
SELECT COUNT(*) AS remaining_warm_slots FROM kubernetes_prewarm_slots;
```

Wait for zero database pool rows and zero warm-labeled Pods and ConfigMaps, including claimed and retiring resources. Investigate cleanup errors while the drain permissions remain available. After all three counts reach zero, restore the baseline for the same context.

```powershell
kubectl --context docker-desktop apply -k infra/kubernetes-desktop
kubectl --context NATIVE_CONTEXT apply -k infra/kubernetes-native
```

The warm runner has a bounded 240-second input wait and Pod lifetime. Input projection and claim time consume that budget. Warm container lifetime includes idle time, so the existing runner-duration metric stays unavailable for this path. Measure provisioning, projection, actual execution and end-to-end completion separately before choosing a default pool policy.
