import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export function reusableNetworkCodesMigration(){return {
 id:'0026_reusable_network_codes',definition:readFileSync(fileURLToPath(import.meta.url),'utf8').replace(/\r\n/g,'\n'),
 async run(connection){
  const [columns]=await connection.query("SHOW COLUMNS FROM distributed_networks LIKE 'active_network_code'");
  if(!columns.length)await connection.query("ALTER TABLE distributed_networks ADD COLUMN active_network_code VARCHAR(64) GENERATED ALWAYS AS (CASE WHEN status='ACTIVE' THEN network_code ELSE NULL END) STORED, ADD UNIQUE INDEX uq_active_network_code(active_network_code)");
  const [indexes]=await connection.query("SHOW INDEX FROM distributed_networks WHERE Key_name='uq_network_code'");
  if(indexes.length)await connection.query('ALTER TABLE distributed_networks DROP INDEX uq_network_code');
 }
};}
