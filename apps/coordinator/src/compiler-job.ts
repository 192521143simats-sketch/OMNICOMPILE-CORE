import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runOwnedProcess} from '@omnicompile/orchestration';
import {compileCSource} from '@omnicompile/compiler-c';
import {dockerJobSchema,programExecutionSchema,type DockerJob} from './docker-executor-schema.js';
import type {ExecutionEvidence} from './execution-evidence.js';

const outputLimit=65536;

export async function executeProgram(payload:unknown){
  const request=programExecutionSchema.parse(payload);
  const workspace=await mkdtemp(join(tmpdir(),'omnicompile-program-'));
  let extraArtifact:{fileName:string;contentBase64:string}|undefined;
  try{
    let executable:string,args:string[],artifactName:string;
    if(request.language==='python'){
      const file=join(workspace,'program.py');await writeFile(file,request.generatedSource,'utf8');
      executable='/usr/local/bin/python';args=['-I',file];artifactName=`compiled_${request.sourceName}`;
    }else if(request.language==='java'){
      const jar=Buffer.from(request.artifactBase64??'','base64');
      if(jar.length>8_000_000||jar.subarray(0,2).toString()!=='PK')throw new Error('The Java execution artifact is invalid.');
      const file=join(workspace,'program.jar');await writeFile(file,jar);
      executable='/usr/bin/java';args=['-Xmx256m','-XX:ActiveProcessorCount=1','-jar',file];artifactName=request.artifactName??request.sourceName;
    }else{
      let binary:Buffer=Buffer.from(request.artifactBase64??'','base64');
      artifactName=request.artifactName??request.sourceName.replace(/\.c$/i,'');
      if(binary.subarray(0,4).toString()!=='\x7fELF'){
        const compiled=await compileCSource(request.generatedSource,request.sourceName);
        binary=compiled.bytes;artifactName=request.sourceName.replace(/\.c$/i,'').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,120)+'-linux';
        extraArtifact={fileName:artifactName,contentBase64:binary.toString('base64')};
      }
      if(binary.length>8_000_000)throw new Error('The C execution artifact exceeds its size limit.');
      executable=join(workspace,'program');await writeFile(executable,binary);await chmod(executable,0o700);args=[];
    }
    const sandbox=process.env.OMNICOMPILE_COMPILER_SANDBOX_EXECUTABLE;
    if(!sandbox)throw new Error('The execution filesystem restriction is unavailable.');
    const started=performance.now();
    const measured=await new Promise<Omit<ExecutionEvidence,'target'|'artifactName'|'input'|'message'>>((resolve,reject)=>{
      const child=spawn(sandbox,[executable,...args],{cwd:workspace,env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:workspace,LANG:'C.UTF-8',TMPDIR:workspace,TMP:workspace,TEMP:workspace},detached:true,stdio:['pipe','pipe','pipe']});
      let status:'TIMED_OUT'|'OUTPUT_LIMIT'|undefined,size=0;
      const stdout:Buffer[]=[],stderr:Buffer[]=[];
      const stop=()=>{if(child.pid)try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}};
      const timer=setTimeout(()=>{status='TIMED_OUT';stop();},10_000);
      const collect=(destination:Buffer[],chunk:Buffer)=>{const remaining=outputLimit-size;if(remaining>0)destination.push(chunk.subarray(0,remaining));size+=chunk.length;if(size>outputLimit&&!status){status='OUTPUT_LIMIT';stop();}};
      child.stdout.on('data',chunk=>collect(stdout,chunk));child.stderr.on('data',chunk=>collect(stderr,chunk));
      child.stdin.on('error',()=>{});child.stdin.end(request.input);
      child.once('error',error=>{clearTimeout(timer);reject(error);});
      child.once('close',(code,signal)=>{
        clearTimeout(timer);stop();
        let error=Buffer.concat(stderr).toString('utf8').replaceAll(workspace+'/', '');
        const output=Buffer.concat(stdout).toString('utf8');
        if(signal&&!error&&size<outputLimit)error=`The program was terminated by ${signal}.`;
        const outputBytes=Buffer.byteLength(output);
        if(outputBytes+Buffer.byteLength(error)>outputLimit)status??='OUTPUT_LIMIT';
        const boundedText=(text:string,limit:number)=>{
          const bytes=Buffer.from(text);
          if(bytes.length<=limit)return text;
          let end=limit;
          while(end>0&&(bytes[end]!&0xc0)===0x80)end--;
          return bytes.subarray(0,end).toString('utf8');
        };
        const boundedOutput=boundedText(output,outputLimit);
        error=boundedText(error,outputLimit-Buffer.byteLength(boundedOutput));
        resolve({status:status??(code===0?'SUCCEEDED':'FAILED'),stdout:boundedOutput,stderr:error,exitCode:code,durationMs:performance.now()-started,peakMemoryBytes:null});
      });
    });
    const messages={SUCCEEDED:'The program exited successfully in the isolated Linux environment.',FAILED:'The program exited unsuccessfully; review its runtime diagnostics.',TIMED_OUT:'Execution exceeded the ten-second limit and was terminated.',OUTPUT_LIMIT:'Execution exceeded the output limit and was terminated.',UNAVAILABLE:'The execution environment was unavailable.',NOT_RUN:'Execution was not performed.'};
    return {execution:{...measured,target:'Linux container',artifactName,input:request.input,message:messages[measured.status]},...(extraArtifact?{artifact:extraArtifact}:{})};
  }finally{await rm(workspace,{recursive:true,force:true});}
}

async function run(job:DockerJob){
  if(job.kind==='execute')return executeProgram(job.payload);
  if(job.kind==='task'){
    const entry=new URL(import.meta.url.endsWith('.ts')?'../../worker/src/task-process.ts':'../../worker/dist/task-process.js',import.meta.url);
    return runOwnedProcess(entry,job.payload);
  }
  const entry=new URL(import.meta.url.endsWith('.ts')?'./compiler-process.ts':'./compiler-process.js',import.meta.url);
  return (await runOwnedProcess(entry,job.payload)).result;
}

async function main(){
  const chunks:Buffer[]=[];let size=0;
  for await(const chunk of process.stdin){size+=chunk.length;if(size>24_000_000)throw new Error('The isolated job payload exceeds its size limit.');chunks.push(Buffer.from(chunk));}
  const job=dockerJobSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  const result=await run(job);console.log(JSON.stringify({ok:true,result}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)void main().catch(cause=>{
  const error=cause as Error&{diagnostics?:unknown};
  console.log(JSON.stringify({ok:false,error:{message:error.message,diagnostics:error.diagnostics}}));
});
