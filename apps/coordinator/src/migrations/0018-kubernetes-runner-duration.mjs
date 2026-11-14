import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export function kubernetesRunnerDurationMigration() {
  return {
    id: '0018_kubernetes_runner_duration',
    definition: readFileSync(fileURLToPath(import.meta.url), 'utf8').replace(/\r\n/g, '\n'),
    async run(connection) {
      const [rows] = await connection.query("SHOW COLUMNS FROM kubernetes_executions LIKE 'runner_duration_ms'");
      if (!rows.length) await connection.query('ALTER TABLE kubernetes_executions ADD runner_duration_ms INT UNSIGNED NULL');
    }
  };
}
