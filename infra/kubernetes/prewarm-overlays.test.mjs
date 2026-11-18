import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import yaml from 'js-yaml';

const kubectl = process.env.OMNICOMPILE_KUBECTL ?? 'kubectl';
const infra = new URL('../', import.meta.url);

function render(overlay) {
  const manifest = execFileSync(kubectl, ['kustomize', overlay], { cwd: infra, encoding: 'utf8' });
  return yaml.loadAll(manifest);
}

function resource(objects, kind, name) {
  const object = objects.find((candidate) => candidate.kind === kind && candidate.metadata.name === name);
  assert.ok(object, `Expected ${kind} ${name}`);
  return object;
}

function brokerEnvironment(objects) {
  const deployment = resource(objects, 'Deployment', 'omnicompile-executor');
  return deployment.spec.template.spec.containers.find((container) => container.name === 'broker').env;
}

const prewarmFlag = 'OMNICOMPILE_PREWARM_ENABLED';

function assertPoolChanges(baseline, rendered, enabled) {
  const expected = structuredClone(baseline);
  const env = brokerEnvironment(expected);
  const flag = env.find((variable) => variable.name === prewarmFlag);
  if (flag) {
    flag.value = enabled;
  } else {
    env.unshift({ name: prewarmFlag, value: enabled });
  }

  env.splice(env.findIndex((variable) => variable.name === prewarmFlag) + 1, 0,
    { name: 'OMNICOMPILE_PREWARM_POLICY', value: 'demand' });

  resource(expected, 'ResourceQuota', 'execution-capacity').spec.hard = {
    'count/jobs.batch': '2',
    'count/configmaps': '82',
    pods: '5',
    'requests.cpu': '1250m',
    'requests.memory': '1280Mi',
    'limits.cpu': '5',
    'limits.memory': '2560Mi',
  };
  const { rules } = resource(expected, 'Role', 'execution-broker');
  rules.find((rule) => rule.resources.includes('configmaps')).verbs.push('list', 'delete');
  rules.find((rule) => rule.resources.includes('pods')).verbs.push('create', 'get', 'delete');

  rules.push({ apiGroups: [''], resources: ['resourcequotas'], resourceNames: ['execution-capacity'], verbs: ['get'] });

  assert.deepEqual(rendered, expected);
}

test('the base Kubernetes overlay renders', () => {
  resource(render('kubernetes'), 'Namespace', 'omnicompile');
});

for (const platform of ['native', 'desktop']) {
  test(`${platform} prewarm and drain render with only the expected pool changes`, () => {
    const baseline = render(`kubernetes-${platform}`);
    const env = brokerEnvironment(baseline);
    assert.notEqual(env.find((variable) => variable.name === prewarmFlag)?.value, '1');
    const runtimeClass = env.find((variable) => variable.name === 'OMNICOMPILE_SANDBOX_RUNTIME_CLASS').value;

    if (platform === 'desktop') {
      assert.equal(runtimeClass, 'omnicompile-desktop-runc');
      assert.equal(resource(baseline, 'RuntimeClass', runtimeClass).handler, 'runc');
      assert.ok(!baseline.some((object) => object.kind === 'Ingress'));

      const config = resource(baseline, 'ConfigMap', 'omnicompile-config').data;
      assert.equal(config.NODE_ENV, 'development');
      for (const key of ['PUBLIC_BASE_URL', 'COORDINATOR_PUBLIC_URL', 'ALLOWED_ORIGINS']) {
        assert.equal(config[key], 'http://127.0.0.1:15173');
      }
      assert.equal(config.OMNICOMPILE_ARTIFACT_ENDPOINT, '');

      const mysql = resource(baseline, 'StatefulSet', 'omnicompile-mysql').spec;
      assert.equal(mysql.volumeClaimTemplates[0].spec.resources.requests.storage, '1Gi');
      assert.equal(
        mysql.template.spec.containers[0].image,
        'mysql:8.4.9@sha256:c36050afdca850f23cef85703f84c7531a5ae155a11b5ee1c60acb09937c4084',
      );
    } else {
      assert.equal(runtimeClass, 'gvisor');
    }

    assertPoolChanges(baseline, render(`kubernetes-${platform}-prewarm`), '1');
    assertPoolChanges(baseline, render(`kubernetes-${platform}-prewarm-drain`), '0');
  });
}
