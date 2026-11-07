import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export function artifactObjectStorageMigration(){return {
  id:'0013_artifact_object_storage',
  definition:readFileSync(fileURLToPath(import.meta.url),'utf8').replace(/\r\n/g,'\n'),
  run:async connection=>{
    const [columns]=await connection.query("SHOW COLUMNS FROM artifacts LIKE 'storage_key'");
    if(!columns.length)await connection.query('ALTER TABLE artifacts ADD storage_key VARCHAR(512) NULL, ADD UNIQUE INDEX idx_artifact_storage_key(storage_key)');
    const [indexes]=await connection.query("SHOW INDEX FROM artifacts WHERE Key_name='idx_artifact_storage_key'");
    if(!indexes.length)await connection.query('CREATE UNIQUE INDEX idx_artifact_storage_key ON artifacts(storage_key)');
  }
};}
