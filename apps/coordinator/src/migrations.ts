import {createHash} from 'node:crypto';
import type {Pool,PoolConnection,RowDataPacket} from 'mysql2/promise';

export type Migration={id:string;definition:string;run:(connection:PoolConnection)=>Promise<void>};
export type AppliedMigration={id:string;checksum:string};
export const migrationChecksum=(definition:string)=>createHash('sha256').update(definition).digest('hex');

/** Definitions are immutable migration identities; append a new migration to change schema. */
export function validateMigrationPlan(plan:readonly Migration[],applied:readonly AppliedMigration[]=[]):void {
  let previous='';
  for(const migration of plan){
    if(!/^\d{4}_[a-z0-9_]+$/.test(migration.id)||migration.id<=previous)throw new Error('Migration IDs must be unique and in ascending order');
    if(!migration.definition.trim())throw new Error('Migration definition must not be empty');
    previous=migration.id;
  }
  const known=new Map(plan.map(migration=>[migration.id,migration]));
  const appliedIds=new Set<string>();
  for(const record of applied){
    const migration=known.get(record.id);
    if(!migration)throw new Error('Database contains an unknown or newer migration');
    if(record.checksum!==migrationChecksum(migration.definition))throw new Error('An applied migration definition has changed');
    if(appliedIds.has(record.id))throw new Error('Applied migration IDs must be unique');
    appliedIds.add(record.id);
  }
  // A missing earlier entry cannot safely be executed after a later migration.
  let gap=false;
  for(const migration of plan){
    if(!appliedIds.has(migration.id))gap=true;
    else if(gap)throw new Error('Applied migration order contains a gap');
  }
}

/** MySQL DDL commits implicitly. Each callback must be idempotent after partial failure. */
export function validateCompletedMigrations(plan:readonly Migration[],applied:readonly AppliedMigration[]):void{
  validateMigrationPlan(plan,applied);
  if(plan.length!==applied.length)throw new Error('Database has pending migrations; run the controlled migration Job before startup');
}
export async function applyMigrations(pool:Pool,database:string,plan:readonly Migration[],mode:'apply'|'check'='apply'):Promise<void> {
  validateMigrationPlan(plan);
  const connection=await pool.getConnection();
  const lock=`omnicompile:migrations:${createHash('sha256').update(database).digest('hex').slice(0,40)}`;
  let acquired=false;
  try{
    const [rows]=await connection.execute<RowDataPacket[]>('SELECT GET_LOCK(?,30) AS acquired',[lock]);
    acquired=Number(rows[0]?.acquired)===1;
    if(!acquired)throw new Error('Timed out acquiring database migration lock');
    if(mode==='apply')await connection.query('CREATE TABLE IF NOT EXISTS schema_migrations (id VARCHAR(96) PRIMARY KEY,checksum CHAR(64) NOT NULL,applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)) ENGINE=InnoDB');
    const [records]=await connection.query<RowDataPacket[]>('SELECT id,checksum FROM schema_migrations ORDER BY id');
    const applied=records.map(row=>({id:String(row.id),checksum:String(row.checksum)}));
    if(mode==='check'){validateCompletedMigrations(plan,applied);return;}
    validateMigrationPlan(plan,applied);
    const completed=new Set(applied.map(row=>row.id));
    for(const migration of plan){
      if(completed.has(migration.id))continue;
      await migration.run(connection);
      await connection.execute('INSERT INTO schema_migrations(id,checksum) VALUES(?,?)',[migration.id,migrationChecksum(migration.definition)]);
    }
  }finally{
    try{if(acquired)await connection.execute('SELECT RELEASE_LOCK(?)',[lock]);}
    finally{connection.release();}
  }
}
