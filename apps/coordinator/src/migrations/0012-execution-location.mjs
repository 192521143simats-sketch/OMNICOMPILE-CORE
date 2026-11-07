import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export function executionLocationMigration(){
  return {
    id:'0012_execution_location',
    definition:readFileSync(fileURLToPath(import.meta.url),'utf8').replace(/\r\n/g,'\n'),
    run:async connection=>{
      const [enrollments]=await connection.query("SHOW COLUMNS FROM network_enrollments LIKE 'execution_location'");
      if(!enrollments.length)await connection.query("ALTER TABLE network_enrollments ADD execution_location ENUM('LOCAL','CLOUD') NOT NULL DEFAULT 'LOCAL', ADD INDEX idx_enrollment_location(network_id,execution_location,status)");
      const [jobs]=await connection.query("SHOW COLUMNS FROM compilation_jobs LIKE 'execution_mode'");
      // Existing work keeps its historical eligibility. New requests explicitly set their mode.
      if(!jobs.length)await connection.query("ALTER TABLE compilation_jobs ADD execution_mode ENUM('CLOUD_ONLY','LOCAL_ONLY','HYBRID') NOT NULL DEFAULT 'HYBRID'");
    }
  };
}
