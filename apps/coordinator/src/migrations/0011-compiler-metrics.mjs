import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export function compilerMetricsMigration(){return {id:'0011_compiler_metrics',definition:readFileSync(fileURLToPath(import.meta.url),'utf8').replace(/\r\n/g,'\n'),run:async connection=>{
 await connection.query(`CREATE TABLE IF NOT EXISTS result_verifications (
 id VARCHAR(64) PRIMARY KEY,task_id VARCHAR(64) NOT NULL,node_id VARCHAR(64) NOT NULL,attempt INT NOT NULL,
 outcome ENUM('PENDING','VERIFIED','REJECTED','FAILED') NOT NULL,method VARCHAR(120) NOT NULL,
 received_at VARCHAR(32) NOT NULL,completed_at VARCHAR(32),INDEX idx_verification_task(task_id,received_at),
 FOREIGN KEY(task_id) REFERENCES tasks(id),FOREIGN KEY(node_id) REFERENCES nodes(id)) ENGINE=InnoDB`);
 await connection.query(`CREATE TABLE IF NOT EXISTS worker_telemetry (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,task_id VARCHAR(64) NOT NULL,node_id VARCHAR(64) NOT NULL,
 platform VARCHAR(16) NOT NULL,cpu_percent DOUBLE NULL,ram_percent DOUBLE NULL,observed_at VARCHAR(32) NOT NULL,
 INDEX idx_telemetry_task(task_id,observed_at),FOREIGN KEY(task_id) REFERENCES tasks(id),FOREIGN KEY(node_id) REFERENCES nodes(id)) ENGINE=InnoDB`);
 await connection.query(`CREATE TABLE IF NOT EXISTS job_worker_availability (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,job_id VARCHAR(64) NOT NULL,observed_at VARCHAR(32) NOT NULL,
 snapshot_json JSON NOT NULL,INDEX idx_availability_job(job_id,observed_at),FOREIGN KEY(job_id) REFERENCES compilation_jobs(id)) ENGINE=InnoDB`);
}};}
