import { describe, it, expect, vi, afterEach } from "vitest";
import {
  executionJob,
  executionPayloads,
  runKubernetesExecution,
} from "./kubernetes-execution.js";
afterEach(() => vi.unstubAllEnvs());
describe("Kubernetes API contract (fake API, no cluster execution)", () => {
  const image = "registry.local/execution@sha256:" + "a".repeat(64);
  it("returns owned Pod logs and deletes only its Job UID", async () => {
    vi.stubEnv("OMNICOMPILE_SANDBOX_RUNTIME_CLASS", "gvisor");
    let jobName = "";
    const deleted: unknown[] = [];
    const output = await runKubernetesExecution(
      '{"language":"python"}',
      image,
      undefined,
      async (method, path, body: any) => {
        if (method === "POST" && path.endsWith("/jobs")) {
          jobName = body.metadata.name;
          return { metadata: { uid: "job-uid" } };
        }
        if (method === "POST" && path.endsWith("/configmaps")) {
          expect(body.metadata.ownerReferences[0]).toMatchObject({
            name: jobName,
            uid: "job-uid",
          });
          return {};
        }
        if (method === "GET" && path.includes("/jobs/"))
          return { status: { succeeded: 1 } };
        if (method === "GET" && path.includes("/pods?"))
          return {
            items: [
              {
                metadata: {
                  name: "foreign",
                  ownerReferences: [{ uid: "foreign" }],
                },
              },
              {
                metadata: {
                  name: "owned",
                  ownerReferences: [{ uid: "job-uid" }],
                },
              },
            ],
          };
        if (method === "GET" && path.includes("/pods/owned/log?"))
          return '{"execution":{"stdout":"actual logs"}}';
        if (method === "DELETE") {
          deleted.push(body);
          return {};
        }
        throw new Error(`Unexpected ${method} ${path}`);
      },
    );
    expect(output).toContain("actual logs");
    expect(deleted).toEqual([
      {
        apiVersion: "v1",
        kind: "DeleteOptions",
        propagationPolicy: "Foreground",
        gracePeriodSeconds: 0,
        preconditions: { uid: "job-uid" },
      },
    ]);
  });
  it("cleans the owned Job when payload delivery fails", async () => {
    vi.stubEnv("OMNICOMPILE_SANDBOX_RUNTIME_CLASS", "gvisor");
    let removed = false;
    await expect(
      runKubernetesExecution("{}", image, undefined, async (method, path) => {
        if (method === "POST" && path.endsWith("/jobs"))
          return { metadata: { uid: "u" } };
        if (method === "DELETE") {
          removed = true;
          return {};
        }
        throw new Error("delivery rejected");
      }),
    ).rejects.toThrow("delivery rejected");
    expect(removed).toBe(true);
  });
  it("cleans an aborted execution without using its aborted signal for cleanup", async () => {
    vi.stubEnv("OMNICOMPILE_SANDBOX_RUNTIME_CLASS", "gvisor");
    const controller = new AbortController();
    let removed = false;
    await expect(
      runKubernetesExecution(
        "{}",
        image,
        controller.signal,
        async (method, path, _body, signal) => {
          if (method === "POST" && path.endsWith("/jobs"))
            return { metadata: { uid: "u" } };
          if (method === "POST") {
            controller.abort();
            return {};
          }
          if (method === "DELETE") {
            expect(signal).toBeUndefined();
            removed = true;
            return {};
          }
          throw new Error("unexpected");
        },
      ),
    ).rejects.toThrow();
    expect(removed).toBe(true);
  });
  it("refuses unpinned images or absent sandbox runtime before API access", async () => {
    vi.stubEnv("OMNICOMPILE_SANDBOX_RUNTIME_CLASS", "");
    const api = vi.fn();
    await expect(
      runKubernetesExecution("{}", "execution:latest", undefined, api),
    ).rejects.toThrow(/digest/);
    await expect(
      runKubernetesExecution("{}", image, undefined, api),
    ).rejects.toThrow(/RuntimeClass/);
    expect(api).not.toHaveBeenCalled();
  });
});
describe("Kubernetes execution transport", () => {
  it("preserves exact payload bytes across bounded ConfigMaps", () => {
    const payload = JSON.stringify({ source: "λ".repeat(700000) });
    const maps = executionPayloads("omnicompile-test", payload, "owner");
    expect(maps.length).toBeGreaterThan(1);
    expect(
      Buffer.concat(
        maps.map((m) => Buffer.from(m.binaryData.payload, "base64")),
      ).toString(),
    ).toBe(payload);
    expect(maps.every((m) => m.binaryData.payload.length < 800000)).toBe(true);
  });
  it("rejects oversized payloads before creating resources", () => {
    expect(() =>
      executionPayloads("omnicompile-test", "x".repeat(24000001), "owner"),
    ).toThrow();
  });
  it("isolates execution and provides bounded job lifetime and ephemeral storage", () => {
    const job = executionJob(
      "omnicompile-test",
      "image@sha256:" + "a".repeat(64),
      "gvisor",
      2,
    );
    const spec = job.spec.template.spec;
    expect(spec.automountServiceAccountToken).toBe(false);
    expect(spec.runtimeClassName).toBe("gvisor");
    expect(spec.restartPolicy).toBe("Never");
    expect(job.spec.activeDeadlineSeconds).toBe(45);
    expect(spec.volumes.some((v) => "hostPath" in v)).toBe(false);
    expect(spec.containers[0]!.securityContext.readOnlyRootFilesystem).toBe(
      true,
    );
    expect(spec.containers[0]!.resources.limits.memory).toBe("512Mi");
  });
});
