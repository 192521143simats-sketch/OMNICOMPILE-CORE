// Explicit local acceptance: restart omnicompile-mysql, never general MYSQL.
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
const sql=query=>sqlAt('omnicompile-mysql',query);
let created=false;
try{
  const container=JSON.parse(docker(['inspect','omnicompile-mysql']))[0];
  const upstream=docker(['image','inspect','mysql:8.4','--format','{{.Id}}']);
  assert.equal(container.Image,upstream);
  assert.equal(container.Config.Image,'omnicompile-mysql:8.4');
  assert.equal(container.Config.Labels['com.docker.compose.project'],'omnicompile');
  assert.equal(container.Config.Labels['com.docker.compose.service'],'omnicompile-mysql');
  assert.ok(container.Mounts.some(m=>m.Type==='volume'&&m.Name==='omnicompile-data'&&m.Destination==='/var/lib/mysql'));
  assert.deepEqual(container.HostConfig.PortBindings['3306/tcp'],[{HostIp:'127.0.0.1',HostPort:'3307'}]);
  assert.equal(container.HostConfig.RestartPolicy.Name,'unless-stopped');
  await wait(()=>assert.equal(sql('SELECT 1'),'1'),'MySQL SQL readiness');
  assert.match(sql('SELECT VERSION()'),/^8\.4\./);
  const adminIdentityQuery="SELECT SHA2(CONCAT_WS(':',id,email,password_hash),256) FROM omnicompile.users WHERE role='ADMIN' ORDER BY id";
  const adminBefore=sql(adminIdentityQuery);
  assert.ok(adminBefore,'An existing administrator is required for the persistence check');
  sql(`CREATE DATABASE ${database}`);created=true;
  sql(`CREATE TABLE ${database}.persistence_marker (id VARCHAR(32) PRIMARY KEY); INSERT INTO ${database}.persistence_marker VALUES ('${nonce}')`);
  docker(['restart','omnicompile-mysql']);
  await wait(()=>assert.equal(sql(`SELECT id FROM ${database}.persistence_marker`),nonce),'persistent SQL marker after restart');
  assert.ok(sql(adminIdentityQuery)===adminBefore,'Administrator identity or password hash changed across database restart');
  const config=JSON.parse(docker(['compose','config','--format','json']));
  assert.equal(config.name,'omnicompile');
  assert.deepEqual(Object.keys(config.services).sort(),['omnicompile-c-worker','omnicompile-coordinator','omnicompile-frontend','omnicompile-java-worker','omnicompile-mysql','omnicompile-python-worker']);
  assert.equal(config.services['omnicompile-coordinator'].environment.DB_HOST,'omnicompile-mysql');
  assert.equal(String(config.services['omnicompile-coordinator'].environment.DB_PORT),'3306');
  assert.equal(config.services['omnicompile-coordinator'].environment.DB_NAME,'omnicompile');
  assert.equal(config.volumes['omnicompile-data'].name,'omnicompile-data');
  assert.equal(config.networks.default.name,'omnicompile-network');
  for(const language of ['c','python','java']){
    const name=`omnicompile-${language}-worker`;
    const worker=JSON.parse(docker(['inspect',name]))[0];
    assert.equal(worker.Config.Image,`${name}:local`);
    assert.equal(worker.State.Health.Status,'healthy');
    assert.equal(worker.Config.User,'node');
    assert.equal(worker.HostConfig.ReadonlyRootfs,true);
    assert.ok(worker.HostConfig.Memory>0);
    assert.ok(!worker.Mounts.some(m=>m.Destination.includes('docker.sock')));
    assert.ok(!config.services[name].ports?.length);
    assert.equal(config.services['omnicompile-coordinator'].environment[`OMNICOMPILE_${language.toUpperCase()}_COMPILER_URL`],`http://${name}:4101`);
  }
  const apiBase='http://127.0.0.1:4100',webBase='http://127.0.0.1:5173';
  await wait(async()=>{const r=await fetch(apiBase+'/ready',{signal:AbortSignal.timeout(4000)});assert.equal(r.status,200);assert.equal((await r.json()).database,'mysql');},'coordinator DB recovery');
  const live=await fetch(apiBase+'/live');assert.equal(live.status,200);
  await wait(async()=>{const r=await fetch(webBase+'/api/product/info',{signal:AbortSignal.timeout(4000)});assert.equal(r.status,401);},'same-origin web/API proxy');
  const page=await fetch(webBase+'/login');assert.equal(page.status,200);assert.match(await page.text(),/OmniCompile Core/);
  const before=performance.now();const health=await fetch(apiBase+'/ready');assert.equal(health.status,200);
  const measuredReadinessResponseMs=Math.round((performance.now()-before)*100)/100;
  console.log(JSON.stringify({mysqlVersion:sql('SELECT VERSION()'),container:'omnicompile-mysql',volume:'omnicompile-data',applicationHostPort:3307,generalMysqlManaged:false,sixComposeServices:true,persistenceAfterRestart:true,adminCredentialsPreserved:true,containerServiceDNS:true,coordinatorReadiness:true,liveness:true,webApiProxy:true,spaRoute:true,measuredReadinessResponseMs,publicDeployment:false}));
}finally{
  if(created){assert.match(database,/^omnicompile_test_[a-f0-9]{16}$/);await wait(()=>sql(`DROP DATABASE ${database}`),'temporary database cleanup');}
}
