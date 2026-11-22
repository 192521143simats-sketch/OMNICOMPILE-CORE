// Read-only factory-launch verification. Never creates test users, jobs or data.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import argon2 from 'argon2';
const env=dotenv.parse(readFileSync('.env'));
assert.equal(env.DB_NAME??'omnicompile','omnicompile');
const db=await mysql.createConnection({host:'127.0.0.1',port:3307,user:'root',password:env.MYSQL_ROOT_PASSWORD,database:'omnicompile'});
const report={checkedAt:new Date().toISOString(),application:'OmniCompile Core',counts:{},publicChecks:[]};
try{
  for(const table of ['compilation_jobs','tasks','results','artifacts','optimization_batches','invitations','sessions','auth_sessions','password_reset_tokens','worker_invitations','worker_invitation_redemptions','native_download_grants']){
    const [[row]]=await db.query(`SELECT COUNT(*) count FROM \`${table}\``);
    report.counts[table]=Number(row.count);assert.equal(Number(row.count),0,`Old application records in ${table}`);
  }
  const [users]=await db.query('SELECT role,password_hash passwordHash FROM users');
  assert.equal(users.length,1,'Exactly one configured bootstrap administrator is expected');
  assert.equal(users[0].role,'ADMIN');
  if(env.ADMIN_PASSWORD)assert.equal(await argon2.verify(users[0].passwordHash,env.ADMIN_PASSWORD),true,'Configured administrator password does not match');
  report.counts.administrators=1;report.counts.ordinaryUsers=0;
  const [networks]=await db.query('SELECT name,network_code code,next_node_number nextNodeNumber FROM distributed_networks');
  assert.deepEqual(networks.map(row=>row.name),['OmniCompile compiler pool']);report.counts.networks=1;
  assert.equal(networks[0].code,'A','Fresh network lettering must start at A');
  assert.equal(Number(networks[0].nextNodeNumber),4,'Three new workers must consume only A001 through A003');
  const [[sequence]]=await db.query('SELECT next_value value FROM network_identity_sequence WHERE id=1');
  assert.equal(Number(sequence.value),2,'The next newly created network must be B');
  report.networkCode='A';report.nextNetworkCode='B';
  const [nodeIds]=await db.query('SELECT id FROM nodes ORDER BY id');
  assert.deepEqual(nodeIds.map(row=>row.id),['NODE-A001','NODE-A002','NODE-A003'],'No retired node identities may remain');
  const [[enrollments]]=await db.query("SELECT COUNT(*) count FROM network_enrollments WHERE status='ACTIVE' AND approval_status='APPROVED' AND revoked_at IS NULL");
  assert.equal(Number(enrollments.count),3);report.counts.enrollments=3;report.workerIds=nodeIds.map(row=>row.id);
  const [[workers]]=await db.query("SELECT COUNT(*) count FROM nodes n JOIN network_enrollments e ON e.id=n.enrollment_id WHERE n.status='AVAILABLE' AND e.approval_status='APPROVED' AND e.execution_location='CLOUD' AND n.revoked_at IS NULL");
  assert.equal(Number(workers.count),3,'Three managed compiler workers must be available');report.counts.managedWorkers=3;
}finally{await db.end();}
const docker='C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe';
const containers=JSON.parse(execFileSync(docker,['inspect','omnicompile-coordinator','omnicompile-mysql','omnicompile-artifacts','omnicompile-executor','omnicompile-c-worker','omnicompile-python-worker','omnicompile-java-worker'],{encoding:'utf8',windowsHide:true}));
for(const container of containers){assert.equal(container.Config.Labels['com.docker.compose.project'],'omnicompile');assert.equal(container.State.Health?.Status,'healthy',container.Name);}
assert.equal(containers[0].Mounts.some(mount=>mount.Destination.startsWith('/app/apps/')),false,'Launch must use the built image, not source-file patches');
const artifactProbe=`import {S3Client,ListObjectsV2Command} from '@aws-sdk/client-s3';import {readFileSync} from 'node:fs';const client=new S3Client({region:'us-east-1',endpoint:process.env.OMNICOMPILE_ARTIFACT_ENDPOINT,forcePathStyle:true,credentials:{accessKeyId:readFileSync(process.env.OMNICOMPILE_ARTIFACT_ACCESS_KEY_FILE,'utf8').trim(),secretAccessKey:readFileSync(process.env.OMNICOMPILE_ARTIFACT_SECRET_KEY_FILE,'utf8').trim()}});const result=await client.send(new ListObjectsV2Command({Bucket:process.env.OMNICOMPILE_ARTIFACT_BUCKET,MaxKeys:1}));console.log(JSON.stringify({objects:result.Contents?.length??0,truncated:!!result.IsTruncated}));client.destroy();`;
const objects=JSON.parse(execFileSync(docker,['exec','omnicompile-coordinator','node','--input-type=module','-e',artifactProbe],{encoding:'utf8',windowsHide:true}));
assert.deepEqual(objects,{objects:0,truncated:false});report.counts.storedArtifactObjects=0;
if(process.argv.includes('--public')){
  for(const [path,status] of [['/',200],['/worker',200],['/web-worker',200],['/windows-worker',200],['/android-worker',200],['/api/auth/me',401]]){
    const response=await fetch('https://omnicompile-core-platform.vercel.app'+path,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,status,path);
    if(path.startsWith('/api/')){assert.match(response.headers.get('content-type')??'',/application\/json/);await response.json();}
    report.publicChecks.push({path,status});
  }
}
mkdirSync('.runtime/launch-clean',{recursive:true});
writeFileSync('.runtime/launch-clean/fresh-launch.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
