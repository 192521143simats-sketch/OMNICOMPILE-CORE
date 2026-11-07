import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash,randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile,realpath,rm} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const execute=promisify(execFile);
const container='omnicompile-mysql';
const maxBytes=128*1024*1024;
const identifier=name=>'`'+name.replaceAll('`','``')+'`';

export function backupPath(root,file){
  if(typeof file!=='string'||file.trim()!==file||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.sql$/.test(file))throw new Error('Use a plain .sql backup filename without directories.');
  return resolve(root,'.runtime','backups',file);
}
export function restoreDatabase(name){
  if(typeof name!=='string'||name.trim()!==name||!/^omnicompile_restore_[a-f0-9]{16}$/.test(name))throw new Error('Restore requires a fresh omnicompile_restore_<16 hexadecimal characters> clone.');
  return name;
}
async function privateDirectory(root){
  const directory=resolve(root,'.runtime','backups');
  await mkdir(directory,{recursive:true,mode:0o700});
  const actual=await realpath(directory),project=await realpath(root);
  const location=relative(project,actual);
  if(isAbsolute(location)||location==='..'||location.startsWith('..\\')||location.startsWith('../'))throw new Error('Backup directory must remain inside this project.');
  return directory;
}
async function verifyContainer(){
  const {stdout}=await execute('docker',['inspect',container],{windowsHide:true,timeout:10000,maxBuffer:100000});
  const item=JSON.parse(stdout)[0];
  if(!item.State.Running||item.Config.Labels?.['com.docker.compose.project']!=='omnicompile')throw new Error('The project MySQL container must be running and owned by this Compose project.');
  const volume=item.Mounts.find(mount=>mount.Destination==='/var/lib/mysql');
  const port=item.HostConfig.PortBindings['3307/tcp'];
  if(volume?.Name!=='OMNICOMPILE-MYSQL'||port?.length!==1||port[0].HostIp!=='127.0.0.1'||port[0].HostPort!=='3307')throw new Error('Project MySQL storage or port does not match the approved configuration.');
}
function mysqlCommand(program,args,password,input){
  return new Promise((resolveResult,reject)=>{
    const child=spawn('docker',['exec','-i','--env','MYSQL_PWD',container,program,'--protocol=TCP','--host=127.0.0.1','--port=3307','--user=root','--default-character-set=utf8mb4',...args],{env:{...process.env,MYSQL_PWD:password},windowsHide:true,stdio:['pipe','pipe','pipe']});
    const chunks=[];let size=0,failed=false;
    const timer=setTimeout(()=>{failed=true;child.kill();reject(new Error('Database backup/restore exceeded its120-second bound.'));},120000);
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){failed=true;child.kill();reject(new Error('Database backup exceeds the128MiB local utility bound.'));}else chunks.push(chunk);});
    // Do not place SQL, credentials or source bodies in logs on command failure.
    child.stderr.resume();
    child.stdin.on('error',()=>{});
    child.once('error',()=>{clearTimeout(timer);reject(new Error('Could not start the Docker database utility.'));});
    child.once('close',code=>{clearTimeout(timer);if(!failed)code===0?resolveResult(Buffer.concat(chunks)):reject(new Error(`Database ${program} failed with exit code ${code}.`));});
    child.stdin.end(input);
  });
}
async function dump(database,password){
  return mysqlCommand('mysqldump',['--single-transaction','--quick','--routines','--events','--triggers','--hex-blob','--set-gtid-purged=OFF','--column-statistics=0','--no-tablespaces','--skip-comments','--skip-add-locks',database],password);
}
async function connect(password){
  return mysql.createConnection({host:'127.0.0.1',port:3307,user:'root',password,connectTimeout:10000,multipleStatements:false});
}
async function backup(root,file,password){
  await privateDirectory(root);
  const path=backupPath(root,file);
  const bytes=await dump('omnicompile',password);
  if(bytes.length===0)throw new Error('Database dump was empty.');
  await writeFile(path,bytes,{flag:'wx',mode:0o600});
  await writeFile(path+'.sha256',createHash('sha256').update(bytes).digest('hex')+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({action:'backup',file:path,bytes:bytes.length,snapshot:'MySQL single transaction'}));
}
async function restore(root,file,target,password){
  restoreDatabase(target);
  await privateDirectory(root);
  const path=backupPath(root,file),bytes=await readFile(path);
  if(!bytes.length||bytes.length>maxBytes)throw new Error('Backup size is invalid.');
  const expected=(await readFile(path+'.sha256','utf8')).trim();
  if(expected!==createHash('sha256').update(bytes).digest('hex'))throw new Error('Backup checksum does not match.');
  const db=await connect(password);
  let created=false;
  try{
    // Deliberately omit IF NOT EXISTS: existing data must never be overwritten.
    await db.query('CREATE DATABASE '+identifier(target));created=true;
    await mysqlCommand('mysql',['--database='+target],password,bytes);
    console.log(JSON.stringify({action:'restore',database:target,existingProjectDatabase:'preserved',checksumVerified:true}));
  }catch(error){if(created)await db.query('DROP DATABASE '+identifier(target));throw error;}
  finally{await db.end();}
}
async function verify(password){
  const nonce=randomBytes(8).toString('hex'),source='omnicompile_backup_test_'+nonce,target=restoreDatabase('omnicompile_restore_'+nonce);
  const db=await connect(password);let sourceCreated=false,targetCreated=false;
  try{
    await db.query('CREATE DATABASE '+identifier(source));sourceCreated=true;
    await db.query('CREATE TABLE '+identifier(source)+'.parents (id INT PRIMARY KEY, name VARCHAR(100) CHARACTER SET utf8mb4)');
    await db.query('CREATE TABLE '+identifier(source)+'.children (id INT PRIMARY KEY, parent_id INT, metadata JSON, payload BLOB, created_at DATETIME(3), FOREIGN KEY(parent_id) REFERENCES '+identifier(source)+'.parents(id))');
    await db.query('INSERT INTO '+identifier(source)+'.parents VALUES (?,?)',[1,'OmniCompile — தமிழ்']);
    await db.query('INSERT INTO '+identifier(source)+'.children VALUES (?,?,?,?,?)',[1,1,JSON.stringify({message:'preserved',values:[1,null,3]}),Buffer.from([0,1,255,13,10]),'2026-11-06 00:00:00.123']);
    const bytes=await dump(source,password);
    await db.query('CREATE DATABASE '+identifier(target));targetCreated=true;
    // mysqldump emits qualified REFERENCES for cross-schema constraints. Only the
    // owned random source schema is rewritten for this isolated clone fixture.
    const restored=Buffer.from(bytes.toString('utf8').replaceAll(identifier(source)+'.',identifier(target)+'.'),'utf8');
    await mysqlCommand('mysql',['--database='+target],password,restored);
    for(const table of ['parents','children']){
      const [[original]]=await db.query('CHECKSUM TABLE '+identifier(source)+'.'+identifier(table)+' EXTENDED');
      const [[clone]]=await db.query('CHECKSUM TABLE '+identifier(target)+'.'+identifier(table)+' EXTENDED');
      if(original.Checksum===null||original.Checksum!==clone.Checksum)throw new Error('Restored row checksum differs.');
    }
    const [foreignKeys]=await db.query('SELECT REFERENCED_TABLE_SCHEMA FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME IS NOT NULL',[target]);
    if(foreignKeys.length!==1||foreignKeys[0].REFERENCED_TABLE_SCHEMA!==target)throw new Error('Restored foreign key does not reference the clone.');
    console.log(JSON.stringify({action:'verify',realMysqldump:true,realMysqlRestore:true,exactRowChecksums:true,unicodeJsonBinaryTimestamps:true,foreignKeys:true,projectDataModified:false,backupFilesCreated:false}));
  }finally{
    if(targetCreated)await db.query('DROP DATABASE '+identifier(target));
    if(sourceCreated)await db.query('DROP DATABASE '+identifier(source));
    await db.end();
  }
}
async function main(){
  dotenv.config({quiet:true});
  const password=process.env.MYSQL_ROOT_PASSWORD;
  if(!password)throw new Error('MYSQL_ROOT_PASSWORD must be configured in the ignored environment.');
  await verifyContainer();
  const [action,file,target]=process.argv.slice(2);
  if(action==='backup')return backup(process.cwd(),file??`backup-${Date.now()}-${randomBytes(4).toString('hex')}.sql`,password);
  if(action==='restore')return restore(process.cwd(),file,restoreDatabase(target),password);
  if(action==='verify')return verify(password);
  throw new Error('Usage: node infra/docker/operations/Database-Backup.mjs backup [filename.sql] | restore filename.sql omnicompile_restore_<16 hex> | verify');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
