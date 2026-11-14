import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export function kubernetesCapacityRetryWaitMigration() {
  return {
    id: '0020_kubernetes_capacity_retry_wait',
    definition: readFileSync(fileURLToPath(import.meta.url), 'utf8').replace(/\r\n/g, '\n'),
    async run(connection) {
      const [rows] = await connection.query("SHOW COLUMNS FROM kubernetes_executions LIKE 'capacity_retry_wait_ms'");
      if (!rows.length) await connection.query('ALTER TABLE kubernetes_executions ADD capacity_retry_wait_ms INT UNSIGNED NULL');
    }
  };
}
