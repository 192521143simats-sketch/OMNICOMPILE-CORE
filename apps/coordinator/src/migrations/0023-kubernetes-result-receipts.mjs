import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export function kubernetesResultReceiptsMigration() {
  return {
    id: '0023_kubernetes_result_receipts',
    definition: readFileSync(fileURLToPath(import.meta.url), 'utf8').replace(/\r\n/g, '\n'),
    async run(connection) {
      const [rows] = await connection.query("SHOW COLUMNS FROM kubernetes_executions LIKE 'request_id'");
      if (!rows.length) await connection.query(`ALTER TABLE kubernetes_executions
        ADD request_id CHAR(36) UNIQUE, ADD request_digest CHAR(64),
        ADD receipt_slot TINYINT UNSIGNED UNIQUE, ADD receipt_expires_at DATETIME(3),
        ADD receipt_digest CHAR(64), ADD receipt_bytes INT UNSIGNED`);
      await connection.query(`CREATE TABLE IF NOT EXISTS kubernetes_result_chunks (
        execution_id CHAR(36) NOT NULL, chunk_number SMALLINT UNSIGNED NOT NULL,
        content MEDIUMBLOB NOT NULL, PRIMARY KEY(execution_id,chunk_number),
        FOREIGN KEY(execution_id) REFERENCES kubernetes_executions(id)
      ) ENGINE=InnoDB`);
    }
  };
}
