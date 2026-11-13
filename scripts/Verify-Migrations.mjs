import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import {applyMigrations} from '../apps/coordinator/src/migrations.ts';
import {databaseMigrationPlan} from '../apps/coordinator/src/database.ts';
import {assertIsolatedTarget,verifyIsolatedCoordinator} from './Integration-Target.mjs';

const target=assertIsolatedTarget();await verifyIsolatedCoordinator(target);
const pool=mysql.createPool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),database:target.database,user:process.env.DB_USER,password:process.env.DB_PASSWORD,connectionLimit:4});
const migrationPlan=databaseMigrationPlan();
const [actual,,links,leases,cancellation]=migrationPlan;
const replaceMigration=(replacement)=>migrationPlan.map(migration=>migration.id===replacement.id?replacement:migration);
const deleteHistory=async migrations=>{const ids=migrations.map(migration=>migration.id);await pool.execute(`DELETE FROM schema_migrations WHERE id IN (${ids.map(()=>'?').join(',')})`,ids);};
const id='9998_engineering_migration_probe';
try{
  const [baseline]=await pool.query('SELECT id,checksum FROM schema_migrations ORDER BY id');
  assert.deepEqual(baseline.map(row=>row.id),migrationPlan.map(migration=>migration.id));
  // Owned legacy rows exercise the actual adoption/backfills, not only a synthetic migration.
  const now=new Date().toISOString();
  await pool.execute("INSERT INTO users(id,name,email,password_hash,role,created_at,updated_at) VALUES('migration-user','Legacy fixture','migration-fixture@example.invalid','not-a-login-hash','USER',?,?)",[now,now]);
  await pool.execute("INSERT INTO distributed_networks(id,public_id,join_token_hash,name,status,created_by,created_at,configuration_json) VALUES('migration-network','migration-public',REPEAT('a',64),'Preserved legacy network','ACTIVE','migration-user',?,'{}')",[now]);
  await pool.execute("INSERT INTO compilation_jobs(id,language,source_name,source_text,status,stage,created_at) VALUES('migration-job','c','legacy.c','int main(){return 0;}','COMPLETED','COMPLETED',?)",[now]);
  await pool.execute("INSERT INTO artifacts(id,job_id,file_name,media_type,content,size_bytes,created_at) VALUES('migration-artifact','migration-job','legacy.c','text/plain',?,3,?)",[Buffer.from('abc'),now]);
  await deleteHistory(baseline);
  let adoptionInvocations=0;
  const interruptedBaseline={...actual,run:async connection=>{
    adoptionInvocations++;
    const fault=new Proxy(connection,{get(object,key){
      if(key==='execute')return async (...args)=>{const result=await object.execute(...args);if(String(args[0]).startsWith('ALTER TABLE nodes MODIFY'))throw new Error('Deliberate baseline DDL interruption');return result;};
      const value=Reflect.get(object,key);return typeof value==='function'?value.bind(object):value;
    }});
    await actual.run(fault);
  }};
  await assert.rejects(applyMigrations(pool,target.database,replaceMigration(interruptedBaseline)),/baseline DDL interruption/);
  const [failedBaseline]=await pool.query('SELECT id FROM schema_migrations');assert.equal(failedBaseline.length,0);
  const resumedBaseline={...actual,run:async connection=>{adoptionInvocations++;await actual.run(connection);}};
  await Promise.all([applyMigrations(pool,target.database,replaceMigration(resumedBaseline)),applyMigrations(pool,target.database,replaceMigration(resumedBaseline))]);
  assert.equal(adoptionInvocations,2);
  const [network]=await pool.query("SELECT name,network_code FROM distributed_networks WHERE id='migration-network'");
  assert.equal(network[0].name,'Preserved legacy network');assert.equal(network[0].network_code,'A');
  const [artifact]=await pool.query("SELECT language,content FROM artifacts WHERE id='migration-artifact'");
  assert.equal(artifact[0].language,'c');assert.equal(artifact[0].content.toString(),'abc');
  await deleteHistory(migrationPlan.slice(2));
  await pool.execute("UPDATE distributed_networks SET join_link_token=NULL WHERE id='migration-network'");
  const interruptedLinks={...links,run:async connection=>{
    const fault=new Proxy(connection,{get(object,key){if(key==='execute')return async(...args)=>{const result=await object.execute(...args);if(String(args[0]).startsWith('UPDATE distributed_networks SET join_link_token='))throw new Error('Deliberate link backfill interruption');return result;};const value=Reflect.get(object,key);return typeof value==='function'?value.bind(object):value;}});
    await links.run(fault);
  }};
  await assert.rejects(applyMigrations(pool,target.database,replaceMigration(interruptedLinks)),/link backfill interruption/);
  const [interruptedToken]=await pool.query("SELECT join_link_token FROM distributed_networks WHERE id='migration-network'");assert.ok(interruptedToken[0].join_link_token);
  await applyMigrations(pool,target.database,migrationPlan);
  const [recoveredToken]=await pool.query("SELECT join_link_token FROM distributed_networks WHERE id='migration-network'");
  assert.equal(recoveredToken[0].join_link_token,interruptedToken[0].join_link_token,'Migration recovery must not rotate an already assigned default link');
  // Owned isolated schema only: prove interruption after MySQL implicitly
  // commits the new column, then concurrent resumption adds exactly one index.
  await deleteHistory(migrationPlan.slice(3));
  await pool.query('ALTER TABLE task_attempts DROP INDEX idx_attempt_lease, DROP COLUMN lease_expires_at');
  const interruptedLeases={...leases,run:async connection=>{
    const fault=new Proxy(connection,{get(object,key){if(key==='query')return async(...args)=>{const result=await object.query(...args);if(String(args[0]).startsWith('ALTER TABLE task_attempts ADD COLUMN'))throw new Error('Deliberate lease DDL interruption');return result;};const value=Reflect.get(object,key);return typeof value==='function'?value.bind(object):value;}});
    await leases.run(fault);
  }};
  await assert.rejects(applyMigrations(pool,target.database,replaceMigration(interruptedLeases)),/lease DDL interruption/);
  const [unrecorded]=await pool.execute('SELECT id FROM schema_migrations WHERE id=?',[leases.id]);assert.equal(unrecorded.length,0);
  await Promise.all([applyMigrations(pool,target.database,migrationPlan),applyMigrations(pool,target.database,migrationPlan)]);
  const [leaseColumns]=await pool.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='task_attempts' AND COLUMN_NAME='lease_expires_at'");assert.equal(leaseColumns.length,1);
  // Proven isolated fixture only: interruption between enum DDL statements
  // must resume without rerunning frozen migrations or losing legacy rows.
  await deleteHistory(migrationPlan.slice(4));
  await pool.query("ALTER TABLE tasks MODIFY status ENUM('QUEUED','ASSIGNED','RUNNING','COMPLETED','FAILED','REQUEUED') NOT NULL");
  await pool.query("ALTER TABLE compilation_jobs MODIFY status ENUM('SUBMITTED','DISTRIBUTING','CODE_GENERATING','COMPLETED','FAILED') NOT NULL");
  await pool.query("ALTER TABLE optimization_batches MODIFY status ENUM('DISTRIBUTING','COMPLETED','FAILED') NOT NULL");
  const interruptedCancellation={...cancellation,run:async connection=>{
    const fault=new Proxy(connection,{get(object,key){if(key==='query')return async(...args)=>{const result=await object.query(...args);if(String(args[0]).startsWith('ALTER TABLE tasks MODIFY'))throw new Error('Deliberate cancellation DDL interruption');return result;};const value=Reflect.get(object,key);return typeof value==='function'?value.bind(object):value;}});
    await cancellation.run(fault);
  }};
  await assert.rejects(applyMigrations(pool,target.database,replaceMigration(interruptedCancellation)),/cancellation DDL interruption/);
  const [unrecordedCancellation]=await pool.execute('SELECT id FROM schema_migrations WHERE id=?',[cancellation.id]);assert.equal(unrecordedCancellation.length,0);
  await Promise.all([applyMigrations(pool,target.database,migrationPlan),applyMigrations(pool,target.database,migrationPlan)]);
  const [cancelColumns]=await pool.query("SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('tasks','compilation_jobs','optimization_batches') AND COLUMN_NAME='status'");assert.equal(cancelColumns.length,3);assert.ok(cancelColumns.every(row=>row.COLUMN_TYPE.includes("'CANCELLED'")));
  const existing={...actual,run:async()=>{throw new Error('An applied baseline must not run again');}};
  let interrupted=true,invocations=0;
  const probe={id,definition:'Owned isolated migration test: partial DDL recovery and serialized startup',run:async connection=>{
    invocations++;
    await connection.query('CREATE TABLE IF NOT EXISTS engineering_migration_probe (id INT PRIMARY KEY) ENGINE=InnoDB');
    if(interrupted){interrupted=false;throw new Error('Deliberate isolated interruption after DDL');}
    await connection.query('INSERT IGNORE INTO engineering_migration_probe VALUES (1)');
  }};
  await assert.rejects(applyMigrations(pool,target.database,[...replaceMigration(existing),probe]),/Deliberate isolated interruption/);
  const [notApplied]=await pool.execute('SELECT id FROM schema_migrations WHERE id=?',[id]);assert.equal(notApplied.length,0);
  await Promise.all([applyMigrations(pool,target.database,[...replaceMigration(existing),probe]),applyMigrations(pool,target.database,[...replaceMigration(existing),probe])]);
  assert.equal(invocations,2);
  const [completed]=await pool.execute('SELECT id FROM schema_migrations WHERE id=?',[id]);assert.equal(completed.length,1);
  await assert.rejects(applyMigrations(pool,target.database,[...replaceMigration(existing),{...probe,definition:'Changed definition'}]),/changed/);
  await assert.rejects(applyMigrations(pool,target.database,replaceMigration(existing)),/unknown|newer/);
  const [data]=await pool.query('SELECT id FROM engineering_migration_probe');assert.deepEqual(data.map(row=>row.id),[1]);
  console.log(JSON.stringify({baselineAdopted:true,legacyDataAndBackfillsPreserved:true,actualBaselineInterruptionRecovered:true,leaseDdlInterruptionRecovered:true,serializedConcurrentStartup:true,partialDdlRecovery:true,failedMigrationNotRecorded:true,changedDefinitionRejected:true,newerDatabaseRejected:true,probeInvocations:invocations}));
}finally{
  // These exact targets are owned fixtures in the isolated database, never developer data.
  await pool.execute('DELETE FROM schema_migrations WHERE id=?',[id]);
  await pool.query('DROP TABLE IF EXISTS engineering_migration_probe');
  await pool.query("DELETE FROM artifacts WHERE id='migration-artifact'");
  await pool.query("DELETE FROM compilation_jobs WHERE id='migration-job'");
  await pool.query("DELETE FROM distributed_networks WHERE id='migration-network'");
  await pool.query("DELETE FROM users WHERE id='migration-user'");
  await pool.end();
}
