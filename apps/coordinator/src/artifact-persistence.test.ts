import {describe,it,expect,vi} from 'vitest';
import {Readable} from 'node:stream';
import type {Pool} from 'mysql2/promise';
import {Store} from './database.js';
import {S3ArtifactStorage,type ObjectClient} from './artifact-storage.js';

function fixture(status:string,commitFailure=false,uploadFailure=false){
  const objects=new Map<string,Buffer>();
  let inserts=0,key='',failureTransitions=0,listings=0;
  const client:ObjectClient={send:async command=>{
    const input=command.input as {Key?:string;Body?:Buffer};
    if(command.constructor.name==='PutObjectCommand'){if(uploadFailure)throw new Error('Storage unavailable');objects.set(input.Key!,input.Body!);return {};}
    if(command.constructor.name==='GetObjectCommand')return {Body:Readable.from([objects.get(input.Key!)!])};
    if(command.constructor.name==='DeleteObjectCommand'){objects.delete(input.Key!);return {};}
    if(command.constructor.name==='ListObjectsV2Command'){listings++;return {Contents:[],IsTruncated:false};}
    return {};
  }};
  const connection={
    beginTransaction:async()=>{},rollback:async()=>{},release:()=>{},
    commit:async()=>{if(commitFailure)throw new Error('Lost commit acknowledgement');},
    execute:async(sql:string,values:unknown[])=>{
      if(sql.startsWith('SELECT language,status'))return [[{language:'c',status}]];
      if(sql.startsWith('INSERT INTO artifacts')){inserts++;key=String(values[11]);expect((values[7] as Buffer).length).toBe(0);}
      return [{affectedRows:1}];
    }
  };
  const pool={getConnection:async()=>connection,query:async()=>[[{ready:1}]],end:async()=>{},execute:async(sql:string)=>{if(sql.startsWith('UPDATE compilation_jobs'))failureTransitions++;return [[{storageKey:key}]];}} as unknown as Pool;
  const Constructor=Store as unknown as {new(pool:Pool,storage:S3ArtifactStorage):Store};
  return {store:new Constructor(pool,new S3ArtifactStorage(client,'omnicompile-artifacts')),objects,inserts:()=>inserts,failureTransitions:()=>failureTransitions,listings:()=>listings};
}
const artifact={artifactType:'EXECUTABLE' as const,fileName:'main',mediaType:'application/octet-stream',bytes:Buffer.from('actual compiled artifact')};

describe('artifact object and MySQL commit boundary',()=>{
  it('does not retain uploads or create metadata for an inactive job',async()=>{
    const test=fixture('CANCELLED');
    await expect(test.store.completeCompilationJob('JOB-ABCDE',[artifact],{})).rejects.toThrow();
    expect(test.inserts()).toBe(0);
    expect(test.objects.size).toBe(0);
  });
  it('stores object metadata without duplicating payload bytes in MySQL',async()=>{
    const test=fixture('CODE_GENERATING');
    await test.store.completeCompilationJob('JOB-ABCDE',[artifact],{});
    expect(test.inserts()).toBe(1);expect(test.objects.size).toBe(1);
    expect([...test.objects.values()][0]).toEqual(artifact.bytes);
  });
  it('preserves an object referenced by MySQL when commit acknowledgement is lost',async()=>{
    const test=fixture('CODE_GENERATING',true);
    await expect(test.store.completeCompilationJob('JOB-ABCDE',[artifact],{})).rejects.toThrow('Lost commit acknowledgement');
    expect(test.objects.size).toBe(1);
  });
  it('records terminal failure even when failure reports cannot reach object storage',async()=>{
    const test=fixture('FAILED',false,true);
    await expect(test.store.attachFailureReports('JOB-ABCDE',[{...artifact,artifactType:'BUILD_REPORT_JSON'}],'Output storage unavailable')).rejects.toThrow('Artifact upload failed');
    expect(test.failureTransitions()).toBe(1);
    expect(test.inserts()).toBe(0);
  });
  it('waits a full configured interval before starting bounded artifact reconciliation',async()=>{
    const previous=process.env.OMNICOMPILE_ARTIFACT_RECONCILE_INTERVAL_MS;
    process.env.OMNICOMPILE_ARTIFACT_RECONCILE_INTERVAL_MS='3600000';
    vi.useFakeTimers();
    const log=vi.spyOn(console,'log').mockImplementation(()=>{});
    const test=fixture('CODE_GENERATING');
    try{
      test.store.startArtifactMaintenance();
      expect(test.listings()).toBe(0);
      await vi.advanceTimersByTimeAsync(3_599_999);expect(test.listings()).toBe(0);
      await vi.advanceTimersByTimeAsync(1);expect(test.listings()).toBe(1);
    }finally{
      await test.store.close();log.mockRestore();vi.useRealTimers();
      if(previous===undefined)delete process.env.OMNICOMPILE_ARTIFACT_RECONCILE_INTERVAL_MS;else process.env.OMNICOMPILE_ARTIFACT_RECONCILE_INTERVAL_MS=previous;
    }
  });
});
