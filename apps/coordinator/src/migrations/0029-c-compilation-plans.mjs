import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export function cCompilationPlansMigration(){return {
 id:'0029_c_compilation_plans',definition:readFileSync(fileURLToPath(import.meta.url),'utf8').replace(/\r\n/g,'\n'),
 async run(connection){await connection.query("CREATE TABLE IF NOT EXISTS c_compilation_plans(job_id VARCHAR(64) PRIMARY KEY,plan_json JSON NOT NULL,task_ids_json JSON NOT NULL,CONSTRAINT fk_c_plan_job FOREIGN KEY(job_id) REFERENCES compilation_jobs(id)) ENGINE=InnoDB");}
};}
