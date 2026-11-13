import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export function invitationRedemptionsMigration() {
  return {
    id: '0015_invitation_redemptions',
    definition: readFileSync(fileURLToPath(import.meta.url), 'utf8').replace(/\r\n/g, '\n'),
    async run(connection) {
      const [columns] = await connection.query(
        "SELECT COLUMN_NAME name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='worker_invitations'"
      );
      const existing = new Set(columns.map(row => row.name));
      if (!existing.has('max_uses')) {
        await connection.query('ALTER TABLE worker_invitations ADD COLUMN max_uses SMALLINT UNSIGNED NOT NULL DEFAULT 1');
      }
      if (!existing.has('used_count')) {
        await connection.query('ALTER TABLE worker_invitations ADD COLUMN used_count SMALLINT UNSIGNED NOT NULL DEFAULT 0');
      }
      await connection.query(`CREATE TABLE IF NOT EXISTS worker_invitation_redemptions (
        invitation_id VARCHAR(64) NOT NULL,
        enrollment_id VARCHAR(64) NOT NULL,
        device_identity_hash CHAR(64) NOT NULL,
        redeemed_at VARCHAR(32) NOT NULL,
        PRIMARY KEY (invitation_id,device_identity_hash),
        UNIQUE KEY uq_invitation_redemption_enrollment (enrollment_id),
        CONSTRAINT fk_redemption_invitation FOREIGN KEY (invitation_id) REFERENCES worker_invitations(id),
        CONSTRAINT fk_redemption_enrollment FOREIGN KEY (enrollment_id) REFERENCES network_enrollments(id)
      ) ENGINE=InnoDB`);
      // The legacy invitation columns retain the original association. Import
      // only one-use records so retrying cannot add history for a multi-use row.
      await connection.query(`
        INSERT INTO worker_invitation_redemptions (invitation_id,enrollment_id,device_identity_hash,redeemed_at)
        SELECT i.id,e.id,e.device_identity_hash,i.consumed_at
        FROM worker_invitations i JOIN network_enrollments e ON e.id=i.consumed_enrollment_id
        LEFT JOIN worker_invitation_redemptions r ON r.enrollment_id=e.id
        WHERE i.max_uses=1 AND i.consumed_at IS NOT NULL AND r.enrollment_id IS NULL
      `);
      await connection.query('UPDATE worker_invitations SET used_count=1 WHERE max_uses=1 AND consumed_at IS NOT NULL AND used_count=0');
      const [constraints] = await connection.query(
        "SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='worker_invitations' AND CONSTRAINT_NAME='chk_worker_invitation_use_count'"
      );
      if (!constraints.length) {
        await connection.query(`
          ALTER TABLE worker_invitations ADD CONSTRAINT chk_worker_invitation_use_count
          CHECK (max_uses BETWEEN 1 AND 100 AND used_count <= max_uses)
        `);
      }
    }
  };
}
