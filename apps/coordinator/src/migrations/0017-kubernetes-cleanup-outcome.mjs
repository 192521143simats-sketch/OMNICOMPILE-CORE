import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export function kubernetesCleanupOutcomeMigration() {
  return {
    id: '0017_kubernetes_cleanup_outcome',
    definition: readFileSync(fileURLToPath(import.meta.url), 'utf8').replace(/\r\n/g, '\n'),
    async run(connection) {
      const [rows] = await connection.query("SHOW COLUMNS FROM kubernetes_executions LIKE 'cleanup_outcome'");
      if (!rows.length) await connection.query('ALTER TABLE kubernetes_executions ADD cleanup_outcome VARCHAR(24)');
    }
  };
}
