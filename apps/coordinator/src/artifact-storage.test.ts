import {describe,it,expect} from 'vitest';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {S3ArtifactStorage,artifactObjectKey,type ObjectClient} from './artifact-storage.js';

const digest=(value:Buffer)=>createHash('sha256').update(value).digest('hex');
describe('durable artifact storage',()=>{
  it('rejects path injection and verifies stored bytes before publishing metadata',async()=>{
    expect(()=>artifactObjectKey('../other','ARTIFACT-one')).toThrow();
    const bytes=Buffer.from('compiled output');
    const objects=new Map<string,Buffer>();
    const client:ObjectClient={send:async command=>{
      const input=command.input as {Key?:string;Body?:Buffer};
      if(command.constructor.name==='PutObjectCommand'){objects.set(input.Key!,input.Body!);return {};}
      if(command.constructor.name==='GetObjectCommand')return {Body:Readable.from([objects.get(input.Key!)!])};
      if(command.constructor.name==='DeleteObjectCommand'){objects.delete(input.Key!);return {};}
      return {};
    }};
    const store=new S3ArtifactStorage(client,'omnicompile-artifacts');
    const key=artifactObjectKey('JOB-ABCDE','ARTIFACT-one');
    await store.put(key,bytes,'application/octet-stream');
    expect(await store.get(key,bytes.length,digest(bytes))).toEqual(bytes);
    objects.set(key,Buffer.from('tampered output'));
    await expect(store.get(key,bytes.length,digest(bytes))).rejects.toThrow('Artifact integrity verification failed');
    await store.remove(key);expect(objects.size).toBe(0);
  });
  it('rejects truncated and oversized responses and removes a failed upload',async()=>{
    let deleted=false;
    const client:ObjectClient={send:async command=>{
      if(command.constructor.name==='GetObjectCommand')return {Body:Readable.from([Buffer.from('bad')])};
      if(command.constructor.name==='DeleteObjectCommand')deleted=true;
      return {};
    }};
    const store=new S3ArtifactStorage(client,'omnicompile-artifacts');
    await expect(store.put('jobs/JOB-ABCDE/ARTIFACT-one',Buffer.from('actual output'),'text/plain')).rejects.toThrow('Artifact integrity verification failed');
    expect(deleted).toBe(true);
    await expect(store.get('jobs/JOB-ABCDE/ARTIFACT-one',2,digest(Buffer.from('ok')))).rejects.toThrow('Artifact integrity verification failed');
  });
  it('reconciles only old unreferenced objects in its database namespace',async()=>{
    const deleted:string[]=[];
    let listedPrefix='';
    const objects:Array<{Key:string;LastModified:Date}>=[];
    const client:ObjectClient={send:async command=>{
      if(command.constructor.name==='ListObjectsV2Command'){listedPrefix=(command.input as {Prefix:string}).Prefix;return {Contents:objects,IsTruncated:false};}
      if(command.constructor.name==='DeleteObjectCommand')deleted.push((command.input as {Key:string}).Key);
      return {};
    }};
    const store=new S3ArtifactStorage(client,'omnicompile-artifacts','owned_fixture');
    const other=new S3ArtifactStorage(client,'omnicompile-artifacts','other_database');
    const orphan=store.objectKey('JOB-ABCDE','ARTIFACT-orphan');
    const referenced=store.objectKey('JOB-ABCDE','ARTIFACT-live');
    const young=store.objectKey('JOB-ABCDE','ARTIFACT-young');
    const foreign=other.objectKey('JOB-ABCDE','ARTIFACT-foreign');
    const old=new Date(Date.now()-48*60*60*1000);
    objects.push({Key:orphan,LastModified:old},{Key:referenced,LastModified:old},{Key:young,LastModified:new Date()},{Key:foreign,LastModified:old},{Key:'jobs/JOB-ABCDE/ARTIFACT-legacy',LastModified:old});
    const options={probeDatabase:async()=>{},isReferenced:async(key:string)=>key===referenced};
    const preview=await store.reconcile(options);
    expect(preview).toMatchObject({dryRun:true,eligible:1,referenced:1,removed:0});
    expect(deleted).toEqual([]);expect(listedPrefix).toBe(store.namespace+'jobs/');
    const applied=await store.reconcile({...options,apply:true});
    expect(applied).toMatchObject({dryRun:false,removed:1});expect(deleted).toEqual([orphan]);
    await expect(store.remove(foreign)).rejects.toThrow('another database');
  });
  it('aborts reconciliation without deleting when database authority is unavailable',async()=>{
    let storageCalls=0;
    const client:ObjectClient={send:async()=>{storageCalls++;return {};}};
    const store=new S3ArtifactStorage(client,'omnicompile-artifacts','fixture');
    await expect(store.reconcile({apply:true,probeDatabase:async()=>{throw new Error('Database unavailable');},isReferenced:async()=>false})).rejects.toThrow('Database unavailable');
    expect(storageCalls).toBe(0);
  });
  it('bounds each scan and advances its continuation cursor without immediate startup sweeping',async()=>{
    const cursors:Array<string|undefined>=[];
    const limits:number[]=[];
    const client:ObjectClient={send:async command=>{
      const input=command.input as {ContinuationToken?:string;MaxKeys:number};
      cursors.push(input.ContinuationToken);limits.push(input.MaxKeys);
      return cursors.length===1?{Contents:[],IsTruncated:true,NextContinuationToken:'next-page'}:{Contents:[],IsTruncated:false};
    }};
    const store=new S3ArtifactStorage(client,'omnicompile-artifacts','fixture');
    expect(cursors).toEqual([]);
    const options={probeDatabase:async()=>{},isReferenced:async()=>false,limit:10};
    await store.reconcile(options);await store.reconcile(options);await store.reconcile(options);
    expect(cursors).toEqual([undefined,'next-page',undefined]);expect(limits).toEqual([10,10,10]);
    await expect(store.reconcile({...options,graceHours:0,apply:true})).rejects.toThrow('bounds');
  });
});
