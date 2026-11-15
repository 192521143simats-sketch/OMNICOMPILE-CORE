import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export function kubernetesFailureReasonMigration() {
  return {
    id: '0022_kubernetes_failure_reason',
    definition: readFileSync(fileURLToPath(import.meta.url), 'utf8').replace(/\r\n/g, '\n'),
    async run(connection) {
      const [rows] = await connection.query("SHOW COLUMNS FROM kubernetes_executions LIKE 'failure_reason'");
      if (!rows.length) {
        await connection.query('ALTER TABLE kubernetes_executions ADD COLUMN failure_reason VARCHAR(32) NULL');
      }
    }
  };
}
