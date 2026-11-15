import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export function kubernetesProvisioningStagesMigration() {
  return {
    id: '0021_kubernetes_provisioning_stages',
    definition: readFileSync(fileURLToPath(import.meta.url), 'utf8').replace(/\r\n/g, '\n'),
    async run(connection) {
      const [columns] = await connection.query('SHOW COLUMNS FROM kubernetes_executions');
      const existing = new Set(columns.map(column => column.Field));
      const missing = ['scheduling_duration_ms', 'container_startup_duration_ms']
        .filter(column => !existing.has(column));
      if (missing.length) {
        await connection.query('ALTER TABLE kubernetes_executions ' +
          missing.map(column => 'ADD COLUMN ' + column + ' INT UNSIGNED NULL').join(', '));
      }
    }
  };
}
