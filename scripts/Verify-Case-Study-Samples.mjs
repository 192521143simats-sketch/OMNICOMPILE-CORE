import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';

// Compiler smoke tests only: these do not assert device/distribution acceptance.
const root=resolve('samples'),manifest=JSON.parse(await readFile(resolve(root,'case-studies/manifest.json'),'utf8'));
const run=(args)=>new Promise((done,reject)=>{
 const child=spawn('docker',args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
 const timer=setTimeout(()=>{child.kill();reject(new Error('Sample toolchain exceeded 60 seconds'));},60000);
 child.on('error',error=>{clearTimeout(timer);reject(error);});child.on('close',code=>{clearTimeout(timer);done({code,stdout:stdout.replaceAll('\r\n','\n'),stderr});});
});
const results=[];
for(const item of manifest.cases){
 if(!/^case-studies\/(c|python|java)\/[A-Za-z_]+\.(c|py|java)$/.test(item.file))throw new Error('Untrusted sample path');
 const name='omnicompile-sample-'+randomUUID(),path='/samples/'+item.file;
 const command=item.language==='c'?`gcc -std=c11 -Wall -Wextra -O2 '${path}' -o /tmp/program || exit 100; /tmp/program`:
 item.language==='python'?`python -c "import py_compile; py_compile.compile('${path}',cfile='/tmp/program.pyc',doraise=True)" || exit 100; python /tmp/program.pyc`:
 `mkdir -p /tmp/classes; javac -proc:none -d /tmp/classes '${path}' || exit 100; java -cp /tmp/classes '${item.file.split('/').at(-1).slice(0,-5)}'`;
 const args=['run','--rm','--name',name,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','512m','--cpus','1','--pids-limit','128','--tmpfs','/tmp:rw,exec,nosuid,nodev,size=128m,mode=1777','--mount',`type=bind,source=${root},target=/samples,readonly`,'--entrypoint','sh',`omnicompile-${item.language}-worker:local`,'-c',command];
 let actual;
 try{actual=await run(args);}finally{await run(['rm','-f',name]).catch(()=>{});}
 const pass=item.outcome==='compile_error'?actual.code===100&&actual.stderr.length>0:item.outcome==='runtime_error'?actual.code!==0&&actual.code!==100&&actual.stderr.includes('reconciliation mismatch'):actual.code===0&&actual.stdout===item.stdout;
 results.push({...item,...actual,pass});console.log(`${pass?'PASS':'FAIL'} ${item.file}: ${item.outcome}`);
}
const directory=resolve('.runtime/sample-validation');await mkdir(directory,{recursive:true});
await writeFile(resolve(directory,'latest.json'),JSON.stringify({testedAt:new Date().toISOString(),scope:'Actual isolated compiler and program execution; no worker-distribution claim',results},null,2));
if(results.some(item=>!item.pass))throw new Error('Case-study sample verification failed; inspect .runtime/sample-validation/latest.json');
console.log(`${results.length} real compiler/execution cases passed.`);
