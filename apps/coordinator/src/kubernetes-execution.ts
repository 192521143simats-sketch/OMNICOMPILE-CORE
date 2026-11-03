import { request } from "node:https";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const serviceAccount = "/var/run/secrets/kubernetes.io/serviceaccount";
const labels = { app: "omnicompile-execution" };
export function executionPayloads(name: string, payload: string, uid: string) {
  const bytes = Buffer.from(payload);
  if (bytes.length > 24000000)
    throw new Error("Execution payload exceeds limit");
  return Array.from(
    { length: Math.ceil(bytes.length / 400000) },
    (_, index) => ({
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: {
        name: `${name}-${index}`,
        labels,
        ownerReferences: [
          {
            apiVersion: "batch/v1",
            kind: "Job",
            name,
            uid,
            controller: true,
            blockOwnerDeletion: false,
          },
        ],
      },
      binaryData: {
        payload: bytes
          .subarray(index * 400000, (index + 1) * 400000)
          .toString("base64"),
      },
    }),
  );
}
export function executionJob(
  name: string,
  image: string,
  runtimeClassName: string,
  count: number,
) {
  const securityContext = {
    allowPrivilegeEscalation: false,
    readOnlyRootFilesystem: true,
    capabilities: { drop: ["ALL"], add: ["SETUID", "SETGID", "CHOWN", "KILL"] },
    seccompProfile: { type: "RuntimeDefault" },
  };
  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: { name, labels },
    spec: {
      backoffLimit: 0,
      activeDeadlineSeconds: 45,
      ttlSecondsAfterFinished: 120,
      template: {
        metadata: { labels },
        spec: {
          runtimeClassName,
          automountServiceAccountToken: false,
          restartPolicy: "Never",
          enableServiceLinks: false,
          terminationGracePeriodSeconds: 1,
          securityContext: { runAsUser: 0, runAsGroup: 0 },
          initContainers: [
            {
              name: "payload",
              image,
              command: [
                "python3",
                "-I",
                "-c",
                `from pathlib import Path; import os; os.chmod('/work',0o1777); os.chmod('/tmp',0o1777); Path('/work/request.json').write_bytes(b''.join(Path('/payload/'+str(i)).read_bytes() for i in range(${count})))`,
              ],
              securityContext: {
                ...securityContext,
                capabilities: { drop: ["ALL"] },
              },
              resources: {
                requests: { cpu: "50m", memory: "32Mi" },
                limits: { cpu: "250m", memory: "128Mi" },
              },
              volumeMounts: [
                { name: "payload", mountPath: "/payload", readOnly: true },
                { name: "work", mountPath: "/work" },
                { name: "tmp", mountPath: "/tmp" },
              ],
            },
          ],
          containers: [
            {
              name: "runner",
              image,
              command: ["python3", "-I", "/opt/omnicompile/kubernetes-entry.py"],
              securityContext,
              resources: {
                requests: { cpu: "100m", memory: "128Mi" },
                limits: { cpu: "1", memory: "512Mi" },
              },
              volumeMounts: [
                { name: "work", mountPath: "/work" },
                { name: "tmp", mountPath: "/tmp" },
              ],
            },
          ],
          volumes: [
            { name: "work", emptyDir: { medium: "Memory", sizeLimit: "64Mi" } },
            { name: "tmp", emptyDir: { medium: "Memory", sizeLimit: "32Mi" } },
            {
              name: "payload",
              projected: {
                sources: Array.from({ length: count }, (_, index) => ({
                  configMap: {
                    name: `${name}-${index}`,
                    items: [{ key: "payload", path: String(index) }],
                  },
                })),
              },
            },
          ],
        },
      },
    },
  };
}
type Api = (
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
) => Promise<any>;
async function inClusterApi(): Promise<Api> {
  const [token, ca] = await Promise.all([
    readFile(`${serviceAccount}/token`, "utf8"),
    readFile(`${serviceAccount}/ca.crt`),
  ]);
  const host = process.env.KUBERNETES_SERVICE_HOST;
  if (!host) throw new Error("Kubernetes API unavailable");
  return (method, path, body, signal) =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          hostname: host,
          port: Number(process.env.KUBERNETES_SERVICE_PORT_HTTPS ?? 443),
          path,
          method,
          ca,
          headers: {
            Authorization: `Bearer ${token.trim()}`,
            "Content-Type": "application/json",
          },
          timeout: 10000,
          ...(signal ? { signal } : {}),
        },
        (response) => {
          const chunks: Buffer[] = [];
          let size = 0;
          response.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > 12000000) {
              req.destroy(new Error("Kubernetes response exceeds bound"));
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () => {
            const text = Buffer.concat(chunks).toString();
            if ((response.statusCode ?? 500) >= 300) {
              reject(new Error(`Kubernetes API status ${response.statusCode}`));
              return;
            }
            try {
              resolve(path.includes("/log?") ? text : JSON.parse(text));
            } catch {
              resolve(text);
            }
          });
        },
      );
      req.on("timeout", () =>
        req.destroy(new Error("Kubernetes API timed out")),
      );
      req.on("error", reject);
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
}
// Injectable API is used for contract tests; production always authenticates using
// the projected, namespace-scoped service account and verifies the API CA.
export async function runKubernetesExecution(
  payload: string,
  image: string,
  signal?: AbortSignal,
  apiOverride?: Api,
): Promise<string> {
  signal = AbortSignal.any([
    AbortSignal.timeout(60000),
    ...(signal ? [signal] : []),
  ]);
  if (!/^[A-Za-z0-9][A-Za-z0-9./:_-]*@sha256:[a-f0-9]{64}$/.test(image))
    throw new Error("Kubernetes execution requires a verified image digest");
  const runtime = process.env.OMNICOMPILE_SANDBOX_RUNTIME_CLASS;
  if (!runtime || !/^[a-z0-9][a-z0-9.-]*$/.test(runtime))
    throw new Error("A verified sandbox RuntimeClass is required");
  const namespace = process.env.OMNICOMPILE_EXECUTION_NAMESPACE ?? "omnicompile-execution";
  if (!/^[a-z0-9][a-z0-9-]*$/.test(namespace))
    throw new Error("Invalid execution namespace");
  const name = `omnicompile-${randomUUID()}`,
    maps = executionPayloads(name, payload, "pending"),
    api = apiOverride ?? (await inClusterApi());
  const batch = `/apis/batch/v1/namespaces/${namespace}/jobs`,
    core = `/api/v1/namespaces/${namespace}`;
  signal?.throwIfAborted();
  let uid: string | undefined;
  try {
    const job = await api(
      "POST",
      batch,
      executionJob(name, image, runtime, maps.length),
      signal,
    );
    uid = job.metadata.uid;
    if (typeof uid !== "string") throw new Error("Job identity missing");
    for (const map of executionPayloads(name, payload, uid))
      await api("POST", `${core}/configmaps`, map, signal);
    const deadline = Date.now() + 55000;
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      const state = await api("GET", `${batch}/${name}`, undefined, signal);
      if (state.status?.failed) throw new Error("Execution Job failed");
      if (state.status?.succeeded) {
        const pods = await api(
          "GET",
          `${core}/pods?labelSelector=${encodeURIComponent(`job-name=${name}`)}`,
          undefined,
          signal,
        );
        const pod = pods.items?.find((value: any) =>
          value.metadata?.ownerReferences?.some(
            (owner: any) => owner.uid === uid,
          ),
        );
        if (!pod) throw new Error("Owned execution Pod missing");
        return await api(
          "GET",
          `${core}/pods/${encodeURIComponent(pod.metadata.name)}/log?container=runner&limitBytes=12000000`,
          undefined,
          signal,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("Execution Job exceeded wall deadline");
  } finally {
    if (uid) {
      try {
        await api("DELETE", `${batch}/${name}`, {
          apiVersion: "v1",
          kind: "DeleteOptions",
          propagationPolicy: "Foreground",
          gracePeriodSeconds: 0,
          preconditions: { uid },
        });
      } catch {
        console.error(
          "Owned Kubernetes execution Job cleanup failed; inspect execution namespace.",
        );
      }
    }
  }
}
