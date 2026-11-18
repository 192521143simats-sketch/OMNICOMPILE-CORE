import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {access,mkdir,mkdtemp,rename,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {readPrewarmedJob} from './prewarmed-input.js';

const podId='omni-python-example';
const job={kind:'execute',language:'python',payload:{language:'python',sourceName:'main.py',generatedSource:'print("hello")',input:''}};
const bytes=Buffer.from(JSON.stringify(job));
const digest=(input:Buffer)=>createHash('sha256').update(input).digest('hex');
const commit={version:1,podId,executionId:'55bcfe47-bc17-4a85-835d-31beb2f44620',language:'python',chunkCount:2,byteLength:bytes.length,sha256:digest(bytes)};
let directory:string;
let marker:string;

beforeEach(async()=>{
  directory=await mkdtemp(join(tmpdir(),'omni-prewarmed-test-'));
  marker=join(directory,'.omni-ready');
});
afterEach(()=>rm(directory,{recursive:true,force:true}));

const putCommit=(override:Record<string,unknown>={})=>writeFile(join(directory,'commit.json'),JSON.stringify({...commit,...override}));
const putChunk=(index:0|1,value:Buffer)=>writeFile(join(directory,index===0?'chunks00':'chunks01'),value);
const read=(options:Parameters<typeof readPrewarmedJob>[2]={})=>readPrewarmedJob('python',podId,{directory,readyPath:marker,timeoutMs:1_000,...options});

describe('prewarmed compiler input',()=>{
  it('waits through a missing commit, out-of-order projection and mixed contents',async()=>{
    const steps=[
      async()=>{await putChunk(1,bytes.subarray(15));await putCommit();},
      ()=>putChunk(0,Buffer.alloc(15,1)),
      ()=>putChunk(0,bytes.subarray(0,15))
    ];
    let polls=0;
    await expect(read({wait:async()=>{
      await access(marker);
      await steps[polls++]!();
    }})).resolves.toEqual(job);
    expect(polls).toBe(3);
    await expect(access(marker)).rejects.toMatchObject({code:'ENOENT'});
  });

  it('follows an AtomicWriter generation swap through stable projection links',async({skip})=>{
    const stale=join(directory,'..old');
    const current=join(directory,'..new');
    await mkdir(stale);
    await mkdir(current);
    for(const generation of [stale,current]){
      await writeFile(join(generation,'commit.json'),JSON.stringify({...commit,chunkCount:1}));
      await writeFile(join(generation,'chunks00'),generation===stale?Buffer.alloc(bytes.length,1):bytes);
    }
    try{
      await symlink(stale,join(directory,'..data'),'junction');
      await symlink(current,join(directory,'..data_tmp'),'junction');
      await symlink(join('..data','commit.json'),join(directory,'commit.json'),'file');
      await symlink(join('..data','chunks00'),join(directory,'chunks00'),'file');
    }catch(cause){
      if(process.platform==='win32'&&(cause as NodeJS.ErrnoException).code==='EPERM'){
        return skip('Creating symbolic links requires Windows Developer Mode or permission.');
      }
      throw cause;
    }
    await expect(read({wait:async()=>{
      const dataLink=join(directory,'..data');
      if(process.platform==='win32')await rm(dataLink);
      await rename(join(directory,'..data_tmp'),dataLink);
    }})).resolves.toEqual(job);
  });

  it.each([
    {version:2},{podId:'other-pod'},{executionId:'invalid'},{language:'java'},
    {chunkCount:0},{chunkCount:41},{byteLength:0},{byteLength:24_000_001},{sha256:'invalid'},{extra:true}
  ])('rejects invalid commit fields immediately (%j)',async override=>{
    await putCommit(override);
    await expect(read({wait:async()=>{throw new Error('Unexpected retry');}})).rejects.toThrow('commit');
    await expect(access(marker)).rejects.toMatchObject({code:'ENOENT'});
  });

  it('rejects a valid commit for a different Docker job language',async()=>{
    const data=Buffer.from(JSON.stringify({...job,language:'java',payload:{...job.payload,language:'java'}}));
    await putChunk(0,data);
    await putCommit({chunkCount:1,byteLength:data.length,sha256:digest(data)});
    await expect(read()).rejects.toThrow('language');
  });

  it.each([
    ['malformed JSON','private-source-preview','The prewarmed payload job is invalid JSON.'],
    ['an invalid Docker job',JSON.stringify({...job,private_source_preview:true}),'The prewarmed payload job does not match the Docker job schema.']
  ])('returns a fixed error for a verified payload containing %s',async(_description,payload,message)=>{
    const data=Buffer.from(payload);
    await putChunk(0,data);
    await putCommit({chunkCount:1,byteLength:data.length,sha256:digest(data)});
    await expect(read()).rejects.toMatchObject({message});
  });

  it.each([{},{byteLength:bytes.length-1},{sha256:digest(Buffer.from('different'))}])(
    'times out when no complete verified projection arrives (%j)',async override=>{
      await putChunk(0,bytes);
      await putCommit({...override,chunkCount:1});
      if(Object.keys(override).length===0)await rm(join(directory,'chunks00'));
      await expect(read({timeoutMs:20})).rejects.toThrow('Timed out');
      await expect(access(marker)).rejects.toMatchObject({code:'ENOENT'});
    }
  );

  it('cleans up readiness when aborted while waiting',async()=>{
    const controller=new AbortController();
    await expect(read({signal:controller.signal,wait:async()=>{
      await access(marker);
      controller.abort();
    }})).rejects.toMatchObject({name:'AbortError'});
    await expect(access(marker)).rejects.toMatchObject({code:'ENOENT'});
  });

  it('discards a verified job when aborted during readiness cleanup',async()=>{
    const controller=new AbortController();
    await putChunk(0,bytes);
    await putCommit({chunkCount:1});
    await expect(read({signal:controller.signal,removeReady:async path=>{
      await access(path);
      controller.abort();
      await rm(path);
    }})).rejects.toMatchObject({name:'AbortError'});
    await expect(access(marker)).rejects.toMatchObject({code:'ENOENT'});
  });

  it('keeps the no-argument stdin CLI contract',()=>{
    const env={...process.env};
    delete env.OMNICOMPILE_COMPILER_SANDBOX_EXECUTABLE;
    const result=spawnSync(process.execPath,['--import','tsx','apps/coordinator/src/compiler-job.ts'],{input:bytes,env,encoding:'utf8',timeout:10_000});
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ok:false,error:{message:'The execution filesystem restriction is unavailable.'}});
  },15_000);
});
