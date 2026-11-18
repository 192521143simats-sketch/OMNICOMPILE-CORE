import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {open,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {z} from 'zod';
import {dockerJobSchema,type DockerJob} from './docker-executor-schema.js';

const maxPayloadBytes=24_000_000;
const maxCommitBytes=4096;
const commitSchema=z.strictObject({
  version:z.literal(1),
  podId:z.string().min(1).max(253),
  executionId:z.uuid(),
  language:z.enum(['c','python','java']),
  chunkCount:z.number().int().min(1).max(40),
  byteLength:z.number().int().min(1).max(maxPayloadBytes),
  sha256:z.string().regex(/^[0-9a-fA-F]{64}$/)
});

async function readProjectionFile(path:string,limit:number):Promise<Buffer|'oversized'|undefined>{
  const file=await open(path,constants.O_RDONLY|constants.O_NONBLOCK).catch((error:NodeJS.ErrnoException)=>{
    if(error.code==='ENOENT')return undefined;
    throw error;
  });
  if(!file)return undefined;
  try{
    const stats=await file.stat();
    if(!stats.isFile())throw new Error('The prewarmed payload projection must contain regular files.');
    if(stats.size>limit)return 'oversized';
    const buffer=Buffer.allocUnsafe(stats.size+1);
    let total=0;
    while(total<buffer.length){
      const {bytesRead}=await file.read(buffer,total,buffer.length-total,null);
      if(!bytesRead)break;
      total+=bytesRead;
    }
    if(total>limit)return 'oversized';
    if(total!==stats.size)return undefined;
    return buffer.subarray(0,total);
  }finally{await file.close();}
}

async function readProjection(directory:string,language:DockerJob['language'],podId:string){
  const commitFile=await readProjectionFile(join(directory,'commit.json'),maxCommitBytes);
  if(!commitFile)return undefined;
  if(commitFile==='oversized')throw new Error('The prewarmed payload commit exceeds its size limit.');

  let rawCommit:unknown;
  try{rawCommit=JSON.parse(commitFile.toString('utf8'));}
  catch{throw new Error('The prewarmed payload commit is invalid JSON.');}
  const parsed=commitSchema.safeParse(rawCommit);
  if(!parsed.success||parsed.data.podId!==podId||parsed.data.language!==language){
    throw new Error('The prewarmed payload commit is invalid or does not match this runner.');
  }

  const commit=parsed.data;
  const chunks:Buffer[]=[];
  const hash=createHash('sha256');
  let bytes=0;
  for(let index=0;index<commit.chunkCount;index++){
    const name='chunks'+String(index).padStart(2,'0');
    const chunk=await readProjectionFile(join(directory,name),commit.byteLength-bytes);
    if(!chunk||chunk==='oversized')return undefined;
    chunks.push(chunk);
    bytes+=chunk.length;
    hash.update(chunk);
  }
  if(bytes!==commit.byteLength||hash.digest('hex')!==commit.sha256.toLowerCase())return undefined;
  let payload:unknown;
  try{payload=JSON.parse(Buffer.concat(chunks,bytes).toString('utf8'));}
  catch{throw new Error('The prewarmed payload job is invalid JSON.');}
  const parsedJob=dockerJobSchema.safeParse(payload);
  if(!parsedJob.success)throw new Error('The prewarmed payload job does not match the Docker job schema.');
  const job=parsedJob.data;
  if(job.language!==language)throw new Error('The prewarmed payload job language does not match this runner.');
  return job;
}

type PrewarmedInputOptions={
  signal?:AbortSignal;
  directory?:string;
  readyPath?:string;
  timeoutMs?:number;
  wait?:(ms:number,signal?:AbortSignal)=>Promise<void>;
  removeReady?:(path:string)=>Promise<void>;
};

export async function readPrewarmedJob(language:DockerJob['language'],podId:string,{
  signal,directory='/payload',readyPath='/tmp/.omni-ready',timeoutMs=60_000,
  wait=(ms,abortSignal)=>delay(ms,undefined,{signal:abortSignal}),
  removeReady=path=>rm(path,{force:true})
}:PrewarmedInputOptions={}):Promise<DockerJob>{
  const deadline=performance.now()+timeoutMs;
  signal?.throwIfAborted();
  await writeFile(readyPath,'',{flag:'wx'});
  try{
    while(performance.now()<deadline){
      signal?.throwIfAborted();
      const job=await readProjection(directory,language,podId);
      signal?.throwIfAborted();
      const remaining=deadline-performance.now();
      if(remaining<=0)break;
      if(job)return job;
      await wait(Math.min(250,remaining),signal);
    }
    signal?.throwIfAborted();
    throw new Error('Timed out waiting for the prewarmed payload.');
  }finally{
    await removeReady(readyPath);
    signal?.throwIfAborted();
  }
}
