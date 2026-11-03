// Explicit local acceptance: restart OMNICOMPILE-DATA, never general MYSQL.
// The only SQL writes target this invocation's random, temporary database.
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
dotenv.config({quiet:true});
const nonce=randomBytes(8).toString('hex'),database=`omnicompile_test_${nonce}`;
const env={...process.env,MYSQL_PWD:process.env.MYSQL_ROOT_PASSWORD};
if(!env.MYSQL_PWD)throw new Error('MYSQL_ROOT_PASSWORD is required');
function docker(args){const result=spawnSync('docker',args,{env,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:2_000_000});if(result.error||result.status!==0)throw new Error(`Docker ${args[0]} failed (secret output withheld)`);return result.stdout.trim();}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(work,label){for(let i=0;i<90;i++){try{return await work();}catch{await pause(1000);}}throw new Error(`Timed out: ${label}`);}
const sqlAt=(container,query)=>docker(['exec','--env','MYSQL_PWD',container,'mysql','--protocol=TCP','-h127.0.0.1','-uroot','--batch','--skip-column-names','-e',query]);
const sql=query=>sqlAt('OMNICOMPILE-DATA',query);
let created=false;
try{
  const container=JSON.parse(docker(['inspect','OMNICOMPILE-DATA']))[0];
  const general=JSON.parse(docker(['inspect','MYSQL']))[0];
  const upstream=docker(['image','inspect','mysql:8.4','--format','{{.Id}}']);
  assert.equal(container.Image,upstream);assert.equal(general.Image,upstream);
  assert.equal(container.Config.Image,'db-omnicompile-database:8.4');
  assert.equal(container.Config.Labels['com.docker.compose.project'],'omnicompile');
  assert.equal(container.Config.Labels['com.docker.compose.service'],'database');
  assert.ok(container.Mounts.some(m=>m.Type==='volume'&&m.Name==='OMNICOMPILE-DATA'&&m.Destination==='/var/lib/mysql'));
  assert.deepEqual(container.HostConfig.PortBindings['3306/tcp'],[{HostIp:'127.0.0.1',HostPort:'3307'}]);
  assert.ok(general.Mounts.some(m=>m.Type==='volume'&&m.Name==='mysql-data'&&m.Destination==='/var/lib/mysql'));
  assert.deepEqual(general.HostConfig.PortBindings['3306/tcp'],[{HostIp:'127.0.0.1',HostPort:'3306'}]);
  assert.ok(!general.Config.Labels?.['com.docker.compose.project']);
  assert.equal(container.HostConfig.RestartPolicy.Name,'unless-stopped');
  assert.equal(sqlAt('MYSQL',"SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='omnicompile'"),'0','General MYSQL must not contain the application database; existing data was preserved.');
  await wait(()=>assert.equal(sql('SELECT 1'),'1'),'MySQL SQL readiness');
  assert.match(sql('SELECT VERSION()'),/^8\.4\./);
  sql(`CREATE DATABASE ${database}`);created=true;
  sql(`CREATE TABLE ${database}.persistence_marker (id VARCHAR(32) PRIMARY KEY); INSERT INTO ${database}.persistence_marker VALUES ('${nonce}')`);
  docker(['restart','OMNICOMPILE-DATA']);
  await wait(()=>assert.equal(sql(`SELECT id FROM ${database}.persistence_marker`),nonce),'persistent SQL marker after restart');
  const config=JSON.parse(docker(['compose','config','--format','json']));
  assert.equal(config.name,'omnicompile');
  assert.deepEqual(Object.keys(config.services).sort(),['backend','database','frontend']);
  assert.equal(config.services.backend.environment.DB_HOST,'database');
  assert.equal(String(config.services.backend.environment.DB_PORT),'3306');
  assert.equal(config.services.backend.environment.DB_NAME,'omnicompile');
  assert.equal(config.volumes['omnicompile-data'].name,'OMNICOMPILE-DATA');
  const apiBase='http://127.0.0.1:4100',webBase='http://127.0.0.1:5173';
  await wait(async()=>{const r=await fetch(apiBase+'/ready',{signal:AbortSignal.timeout(4000)});assert.equal(r.status,200);assert.equal((await r.json()).database,'mysql');},'coordinator DB recovery');
  const live=await fetch(apiBase+'/live');assert.equal(live.status,200);
  await wait(async()=>{const r=await fetch(webBase+'/api/product/info',{signal:AbortSignal.timeout(4000)});assert.equal(r.status,401);},'same-origin web/API proxy');
  const page=await fetch(webBase+'/login');assert.equal(page.status,200);assert.match(await page.text(),/OmniCompile Core/);
  const before=performance.now();const health=await fetch(apiBase+'/ready');assert.equal(health.status,200);
  const measuredReadinessResponseMs=Math.round((performance.now()-before)*100)/100;
  console.log(JSON.stringify({mysqlVersion:sql('SELECT VERSION()'),container:'OMNICOMPILE-DATA',volume:'OMNICOMPILE-DATA',applicationHostPort:3307,generalContainer:'MYSQL',generalVolume:'mysql-data',generalHostPort:3306,generalApplicationDatabaseAbsent:true,threeComposeServices:true,persistenceAfterRestart:true,containerServiceDNS:true,coordinatorReadiness:true,liveness:true,webApiProxy:true,spaRoute:true,measuredReadinessResponseMs,publicDeployment:false}));
}finally{
  if(created){assert.match(database,/^omnicompile_test_[a-f0-9]{16}$/);await wait(()=>sql(`DROP DATABASE ${database}`),'temporary database cleanup');}
}
