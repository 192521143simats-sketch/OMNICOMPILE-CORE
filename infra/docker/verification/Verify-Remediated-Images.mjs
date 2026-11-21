// Isolated adapter for the existing compiler, execution and image acceptance suites.
// --check validates every adaptation and parses the generated suite without Docker.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const id=randomBytes(8).toString('hex'),prefix=`omnicompile-regression-${id}`;
const network=prefix,label=`omnicompile.regression=${id}`,files=[];
const secrets=await mkdtemp(join(tmpdir(),prefix));
// Do not inherit application configuration or load the developer .env.
const env={...process.env,MYSQL_ROOT_PASSWORD:randomBytes(32).toString('hex')};
for(const key of Object.keys(env))if(/^(DB_|OMNICOMPILE_|POSTHOG_|RESEND_)/.test(key))delete env[key];
let networkCreated=false;
function docker(args){const r=spawnSync('docker',args,{env,encoding:'utf8',timeout:180000,windowsHide:true,maxBuffer:3000000});if(r.error||r.status!==0)throw new Error(`docker ${args[0]} failed: ${r.stderr?.slice(-1200)??r.error?.message}`);return r.stdout.trim();}
function create(suffix,image,args=[]){const name=`${prefix}-${suffix}`;const health=suffix.endsWith('-worker')?['--health-cmd',`node -e "fetch('http://127.0.0.1:4101/ready',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`,'--health-interval','5s','--health-timeout','5s','--health-retries','18']:[];docker(['create','--name',name,'--network',network,'--label',label,'--memory','768m','--pids-limit','256',...health,...args,image]);docker(['start',name]);return name;}
const secretArgs=names=>names.flatMap(name=>['--mount',`type=bind,source=${join(secrets,name+'.token')},target=/run/secrets/${name},readonly`]);
// Exact, count-checked edits fail closed when the underlying acceptance changes.
function edit(source,before,after,count=1){assert.equal(source.split(before).length-1,count,`Acceptance adapter expected ${count} occurrences: ${before}`);return source.replaceAll(before,after);}
async function generate(dbPort){
 let source=await readFile('infra/docker/verification/Verify-Docker-Compilers.mjs','utf8');
 source=edit(source,"dotenv.config({quiet:true});",'// Isolated fixture: no dotenv.');
 source=edit(source,"port:3307,user:'root'",`port:${dbPort},user:'root'`,2);
 source=edit(source,"resolve('.runtime/docker/secrets/compiler.token')",`resolve(${JSON.stringify(join(secrets,'compiler.token'))})`);
 source=edit(source,"resolve('.runtime/docker/secrets/executor.token')",`resolve(${JSON.stringify(join(secrets,'executor.token'))})`,2);
 source=edit(source,"resolve('.runtime/docker/secrets/'+name+'.token')",`resolve(${JSON.stringify(secrets)},name+'.token')`);
 source=edit(source,"['omnicompile-mysql','omnicompile-coordinator',","['omnicompile-mysql',"); // No developer coordinator health check.
 source=edit(source,"  await docker(['network','connect','omnicompile-storage-network',coordinator]);",'');
 source=edit(source,"'--network','omnicompile-network'",`'--network','${network}','--label','${label}'`,2);
 // Replace only service hostnames/container names, leaving image tags and bucket names intact.
 for(const name of ['mysql','frontend','c-worker','python-worker','java-worker','executor','artifacts']){
   source=source.replaceAll(`http://omnicompile-${name}:`,`http://${prefix}-${name}:`);
   source=source.replaceAll(`'omnicompile-${name}'`,`'${prefix}-${name}'`);
   source=source.replaceAll(`DB_HOST=omnicompile-${name}`,`DB_HOST=${prefix}-${name}`);
 }
 // Object storage is private tmpfs. Removing individual objects is unnecessary;
 // the original schema cleanup still runs against the isolated database only.
 const start=source.indexOf('        const [[metadata]]');
 const end=source.indexOf('        await cleanup.query(`DROP DATABASE',start);
 assert.ok(start>0&&end>start,'Acceptance object cleanup boundaries changed');
 source=source.slice(0,start)+source.slice(end);
 let execution=await readFile('infra/docker/verification/Verify-Docker-Execution.mjs','utf8');
 // Remove only the host imports, never imports inside the container's raw script.
 for(const line of ["import assert from 'node:assert/strict';","import {spawn} from 'node:child_process';","import {setTimeout as delay} from 'node:timers/promises';"])execution=edit(execution,line,'');
 assert.ok(execution.includes("import {requestDockerJob} from '@omnicompile/orchestration';"),'Container execution client import must be preserved');
 execution=edit(execution,"'omnicompile-coordinator'",'coordinator');
 const marker='  console.log(JSON.stringify({instance,coordinatorHasNativeToolchains';
 source=edit(source,marker,`  {\n${execution}\n  }\n${marker}`);
 source="import {spawn} from 'node:child_process';\nimport {setTimeout as delay} from 'node:timers/promises';\n"+source;
 assert.ok(!source.includes('.runtime/docker/secrets/'));
 assert.ok(!source.includes('omnicompile-storage-network'));
 assert.ok(!source.includes("'--network','omnicompile-network'"));
 assert.ok(!source.includes('dotenv.config('));
 return source;
}
async function generateImages(){
   let images=await readFile('infra/docker/verification/Verify-Images.mjs','utf8');
   images=edit(images,'`omnicompile.image-test=${instance}`',`'${label}'`,2);
   images=edit(images,"'--rm','--network',network",`'--rm','--label','${label}','--network',network`);
   images=edit(images,'{{ index .Config.Labels "omnicompile.image-test" }}','{{ index .Config.Labels "omnicompile.regression" }}');
   images=edit(images,'{{ index .Labels "omnicompile.image-test" }}','{{ index .Labels "omnicompile.regression" }}');
   images=edit(images,'assert.equal(label,instance)',`assert.equal(label,'${id}')`);
   images=edit(images,"',network]),instance)",`',network]),'${id}')`);
   return images;
}
async function run(source,name,check=false){const path=resolve(`infra/docker/verification/.${prefix}-${name}.mjs`);files.push(path);await writeFile(path,source);const r=spawnSync(process.execPath,check?['--check',path]:[path],{env,stdio:'inherit',timeout:1200000,windowsHide:true});assert.equal(r.status,0,`${name} ${check?'syntax':'acceptance'} failed`);}
try{
 if(process.argv.includes('--check')){await run(await generate(13307),'compilers',true);await run(await generateImages(),'images',true);console.log('Isolated acceptance adaptations and generated syntax: PASS');}
 else{
   // Must be serial: the existing execution suite observes broker job names globally.
   assert.equal(docker(['ps','--all','--filter','name=^/omnicompile-job-','--format','{{.Names}}']),'','Wait for existing execution jobs before acceptance');
   for(const name of ['compiler','executor','artifacts-access','artifacts-secret'])await writeFile(join(secrets,name+'.token'),randomBytes(32).toString('hex'),{mode:0o600});
   // The host-side API assertions need loopback-published MySQL. Docker does
   // not publish ports on internal-only bridges; execution jobs still use none.
   docker(['network','create','--label',label,network]);networkCreated=true;
   const db=create('mysql','omnicompile-mysql:8.4',['--tmpfs','/var/lib/mysql:rw','--env','MYSQL_ROOT_PASSWORD','--env','MYSQL_ROOT_HOST=%','--env',`MYSQL_DATABASE=omnicompile_fixture_${id}`,'--publish','127.0.0.1::3307']);
   const dbPort=Number(docker(['port',db,'3307/tcp']).split(':').at(-1));assert.ok(Number.isInteger(dbPort)&&dbPort>0);
   create('artifacts','omnicompile-artifacts:local',['--read-only','--tmpfs','/tmp:rw,size=64m,mode=1777','--tmpfs','/data:rw,size=512m,uid=1000,gid=1000',...secretArgs(['artifacts-access','artifacts-secret'])]);
   create('executor','omnicompile-executor:local',['--user','0:0','--read-only','--tmpfs','/tmp:rw,size=64m,mode=1777','--mount','type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock,readonly',...secretArgs(['executor']),'--env','OMNICOMPILE_EXECUTOR_TOKEN_FILE=/run/secrets/executor','--env',`OMNICOMPILE_EXECUTOR_INSTANCE_ID=${id}`]);
   for(const language of ['c','python','java'])create(`${language}-worker`,`omnicompile-${language}-worker:local`,['--read-only','--tmpfs','/tmp:rw,size=128m,mode=1777',...secretArgs(['executor']),'--mount',`type=bind,source=${join(secrets,'compiler.token')},target=/run/secrets/compiler-token,readonly`,'--env',`OMNICOMPILE_WORKER_LANGUAGE=${language}`,'--env','OMNICOMPILE_COMPILER_TOKEN_FILE=/run/secrets/compiler-token','--env','OMNICOMPILE_EXECUTOR_TOKEN_FILE=/run/secrets/executor','--env',`OMNICOMPILE_EXECUTOR_URL=http://${prefix}-executor:4102`]);
   create('frontend','omnicompile-frontend:local');
   await run(await generate(dbPort),'compilers');
   await run(await generateImages(),'images');
 }
}finally{
 const failures=[];
 if(networkCreated){
   // Includes nested acceptance containers even when a child times out or crashes.
   for(const [key,value] of [['omnicompile.regression',id],['omnicompile.execution.instance',id]]){
     try{for(const name of docker(['ps','--all','--filter',`label=${key}=${value}`,'--format','{{.Names}}']).split('\n').filter(Boolean).reverse()){
       try{assert.equal(docker(['inspect','--format',`{{index .Config.Labels "${key}"}}`,name]),value);docker(['rm','-f','-v',name]);}catch(error){failures.push(error);}
     }}catch(error){failures.push(error);}
   }
   try{for(const ownedNetwork of docker(['network','ls','--filter',`label=${label}`,'--format','{{.Name}}']).split('\n').filter(Boolean)){
     try{assert.equal(docker(['network','inspect','--format','{{index .Labels "omnicompile.regression"}}',ownedNetwork]),id);docker(['network','rm',ownedNetwork]);}catch(error){failures.push(error);}
   }}catch(error){failures.push(error);}
 }
 for(const file of files)try{await rm(file,{force:true});}catch(error){failures.push(error);}
 try{await rm(secrets,{recursive:true,force:true});}catch(error){failures.push(error);}
 if(failures.length)throw new AggregateError(failures,'Isolated acceptance cleanup failed');
}
