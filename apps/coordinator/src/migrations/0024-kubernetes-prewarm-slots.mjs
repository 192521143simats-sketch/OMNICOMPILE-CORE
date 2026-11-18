import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export function kubernetesPrewarmSlotsMigration() {
  return {
    id: '0024_kubernetes_prewarm_slots',
    definition: readFileSync(fileURLToPath(import.meta.url), 'utf8').replace(/\r\n/g, '\n'),
    async run(connection) {
      await connection.query(`CREATE TABLE IF NOT EXISTS kubernetes_prewarm_slots (
        language ENUM('c','python','java') NOT NULL PRIMARY KEY,
        pod_name VARCHAR(63) NOT NULL UNIQUE, pod_uid VARCHAR(128),
        image VARCHAR(512) NOT NULL, runtime_class VARCHAR(63) NOT NULL,
        state ENUM('PROVISIONING','IDLE','CLAIMED','RETIRING') NOT NULL,
        idle_expires_at DATETIME(3) NOT NULL, expires_at DATETIME(3) NOT NULL,
        execution_id CHAR(36) UNIQUE,
        FOREIGN KEY(execution_id) REFERENCES kubernetes_executions(id)
      ) ENGINE=InnoDB`);
    }
  };
}
