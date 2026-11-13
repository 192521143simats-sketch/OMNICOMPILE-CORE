import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export function kubernetesExecutionsMigration() {
  return {
    id: '0016_kubernetes_executions',
    definition: readFileSync(fileURLToPath(import.meta.url), 'utf8').replace(/\r\n/g, '\n'),
    async run(connection) {
      await connection.query(`CREATE TABLE IF NOT EXISTS kubernetes_executions (
        id CHAR(36) PRIMARY KEY, slot TINYINT UNSIGNED UNIQUE,
        language VARCHAR(8) NOT NULL, kind VARCHAR(8) NOT NULL,
        state VARCHAR(24) NOT NULL, job_uid VARCHAR(128),
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        expires_at DATETIME(3) NOT NULL, finished_at DATETIME(3),
        INDEX idx_kubernetes_execution_created (created_at,id)
      ) ENGINE=InnoDB`);
    }
  };
}
