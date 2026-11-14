import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export function kubernetesProvisioningDurationMigration() {
  return {
    id: '0019_kubernetes_provisioning_duration',
    definition: readFileSync(fileURLToPath(import.meta.url), 'utf8').replace(/\r\n/g, '\n'),
    async run(connection) {
      const [rows] = await connection.query("SHOW COLUMNS FROM kubernetes_executions LIKE 'provisioning_duration_ms'");
      if (!rows.length) await connection.query('ALTER TABLE kubernetes_executions ADD provisioning_duration_ms INT UNSIGNED NULL');
    }
  };
}
