# Optional prewarmed execution pool

This overlay is disabled in the standard deployment. Live Kubernetes pool acceptance is still pending. It provisions at most one pristine Pod per language, with an irreversible claim and single execution. Completed Pods are deleted. Idle Pods expire, and the existing two-execution admission bound applies.

Before enabling, run migration 0024 through the controlled migration process, publish matching coordinator and language images containing the prewarmed runner, and verify their pinned digests and the selected RuntimeClass. Reserve the overlay's five-Pod resource budget. Validate C, Python and Java, ownership, cancellation, receipt replay, broker restart, idle expiry and cleanup locally before considering cloud use.

Render the candidate without deploying it.

```powershell
kubectl kustomize infra/kubernetes-native-prewarm
kubectl kustomize infra/kubernetes-native-prewarm-drain
```

## Disable and drain

Use the drain overlay to disable new warm claims while retaining cleanup permissions and quota. These commands target an environment already using the native baseline. Replace NATIVE_CONTEXT with that environment context. Applying manifests is an operator action requiring a working cluster. Docker Desktop requires a separately composed Desktop pool overlay that preserves its runtime, origin and storage configuration.

```powershell
kubectl --context NATIVE_CONTEXT apply -k infra/kubernetes-native-prewarm-drain
kubectl --context NATIVE_CONTEXT -n omnicompile rollout status deployment/omnicompile-executor
kubectl --context NATIVE_CONTEXT -n omnicompile-execution get pods -l omnicompile.io/prewarm-language
kubectl --context NATIVE_CONTEXT -n omnicompile-execution get configmaps -l omnicompile.io/prewarm-pod
```

Using the existing authorized MySQL administration connection, run the following read-only check against the same database used by the broker.

```sql
SELECT COUNT(*) AS remaining_warm_slots FROM kubernetes_prewarm_slots;
```

Wait for zero database pool rows and zero warm-labeled Pods and ConfigMaps, including claimed and retiring resources. Investigate cleanup errors while the drain permissions remain available. Then restore `infra/kubernetes-native` in that same native environment. A direct rollback that removes warm cleanup RBAC before draining can leave retained resources and make the broker unready.

The warm runner has a bounded 240-second input wait and Pod lifetime. Input projection and claim time consume that budget. Warm container lifetime includes idle time, so the existing runner-duration metric stays unavailable for this path. Measure provisioning, projection, actual execution and end-to-end completion separately before choosing a default pool policy. This pool alone does not implement resource-aware autoscaling.
