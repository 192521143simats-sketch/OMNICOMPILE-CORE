import {S3Client,CreateBucketCommand,HeadBucketCommand,PutObjectCommand,GetObjectCommand,DeleteObjectCommand,ListObjectsV2Command} from '@aws-sdk/client-s3';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {verifyArtifactIntegrity} from './task-policy.js';

const maximumArtifactBytes=32_000_000;
type ObjectCommand=CreateBucketCommand|HeadBucketCommand|PutObjectCommand|GetObjectCommand|DeleteObjectCommand|ListObjectsV2Command;
export type ObjectClient={send:(command:ObjectCommand)=>Promise<any>};

export function artifactNamespace(databaseName:string){
  if(!databaseName||databaseName.length>64)throw new Error('An authoritative database name is required for artifact storage');
  return `databases/${createHash('sha256').update(databaseName).digest('hex')}/`;
}
export function artifactObjectKey(jobId:string,artifactId:string,namespace=''){
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(jobId)||!/^ARTIFACT-[A-Za-z0-9_-]{1,55}$/.test(artifactId))throw new Error('Invalid artifact identity');
  if(namespace&&!/^databases\/[a-f0-9]{64}\/$/.test(namespace))throw new Error('Invalid artifact database namespace');
  return `${namespace}jobs/${jobId}/${artifactId}`;
}
function validateKey(key:string){if(!/^(?:databases\/[a-f0-9]{64}\/)?jobs\/[A-Za-z0-9_-]{1,64}\/ARTIFACT-[A-Za-z0-9_-]{1,55}$/.test(key))throw new Error('Invalid artifact storage reference');}

export type ReconcileOptions={
  apply?:boolean;graceHours?:number;limit?:number;
  probeDatabase:()=>Promise<void>;
  isReferenced:(key:string)=>Promise<boolean>;
};

/** The private object store carries bytes; MySQL remains authoritative for ownership. */
export class S3ArtifactStorage{
  readonly namespace:string;
  private reconciliationCursor:string|undefined;
  constructor(private readonly client:ObjectClient,readonly bucket:string,databaseName='omnicompile'){
    if(!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket))throw new Error('Invalid artifact bucket configuration');
    this.namespace=artifactNamespace(databaseName);
  }
  objectKey(jobId:string,artifactId:string){return artifactObjectKey(jobId,artifactId,this.namespace);}
  async initialize(){
    try{await this.client.send(new HeadBucketCommand({Bucket:this.bucket}));}
    catch(error){
      const status=(error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode;
      if(status!==404)throw new Error('Artifact storage is unavailable or access was denied');
      try{await this.client.send(new CreateBucketCommand({Bucket:this.bucket}));}
      catch(cause){if(!['BucketAlreadyOwnedByYou','BucketAlreadyExists'].includes((cause as {name?:string}).name??''))throw new Error('Artifact bucket initialization failed');}
    }
  }
  async put(key:string,bytes:Buffer,contentType:string){
    validateKey(key);
    if(bytes.length<1||bytes.length>maximumArtifactBytes)throw new Error('Artifact size is outside the supported bounds');
    const digest=createHash('sha256').update(bytes).digest('hex');
    try{
      await this.client.send(new PutObjectCommand({Bucket:this.bucket,Key:key,Body:bytes,ContentType:contentType,Metadata:{sha256:digest}}));
      // Read the durable object back before a successful database record can refer to it.
      await this.get(key,bytes.length,digest);
    }catch(error){
      await this.remove(key).catch(()=>console.error('An uncommitted artifact object requires storage reconciliation.'));
      if(error instanceof Error&&error.message==='Artifact integrity verification failed')throw error;
      throw new Error('Artifact upload failed; successful output was not published');
    }
  }
  async get(key:string,size:number,digest:unknown):Promise<Buffer>{
    validateKey(key);
    if(!Number.isSafeInteger(size)||size<1||size>maximumArtifactBytes)throw new Error('Artifact integrity verification failed');
    let response;
    try{response=await this.client.send(new GetObjectCommand({Bucket:this.bucket,Key:key}));}
    catch{throw new Error('The stored artifact is unavailable');}
    const chunks:Buffer[]=[];let received=0;
    const body=response.Body as AsyncIterable<Uint8Array>&{destroy?:()=>void};
    if(!body||typeof body[Symbol.asyncIterator]!=='function')throw new Error('The stored artifact is unavailable');
    try{
      for await(const chunk of body){
        received+=chunk.byteLength;
        if(received>size){body.destroy?.();throw new Error('Artifact integrity verification failed');}
        chunks.push(Buffer.from(chunk));
      }
    }catch(error){
      if(error instanceof Error&&error.message==='Artifact integrity verification failed')throw error;
      throw new Error('The stored artifact could not be read completely');
    }
    const bytes=Buffer.concat(chunks);
    if(!verifyArtifactIntegrity(bytes,size,digest))throw new Error('Artifact integrity verification failed');
    return bytes;
  }
  async remove(key:string){
    validateKey(key);
    if(key.startsWith('databases/')&&!key.startsWith(this.namespace))throw new Error('Cannot remove another database namespace');
    await this.client.send(new DeleteObjectCommand({Bucket:this.bucket,Key:key}));
  }
  async reconcile(options:ReconcileOptions){
    const apply=options.apply===true,graceHours=options.graceHours??24,limit=options.limit??100;
    if(!Number.isInteger(graceHours)||graceHours<24||graceHours>8760||!Number.isInteger(limit)||limit<1||limit>1000)throw new Error('Invalid artifact reconciliation bounds');
    // No listing or deletion is attempted while database authority is unavailable.
    await options.probeDatabase();
    const response=await this.client.send(new ListObjectsV2Command({Bucket:this.bucket,Prefix:this.namespace+'jobs/',MaxKeys:limit,...(this.reconciliationCursor?{ContinuationToken:this.reconciliationCursor}:{})}));
    const cutoff=Date.now()-graceHours*60*60*1000;
    const result={namespace:this.namespace,dryRun:!apply,scanned:0,eligible:0,referenced:0,removed:0,nextPage:Boolean(response.IsTruncated)};
    for(const object of (response.Contents??[]).slice(0,limit)){
      result.scanned++;
      const key=object.Key;
      if(typeof key!=='string'||!key.startsWith(this.namespace+'jobs/'))continue;
      try{validateKey(key);}catch{continue;}
      const modified=object.LastModified instanceof Date?object.LastModified.getTime():NaN;
      if(!Number.isFinite(modified)||modified>cutoff)continue;
      if(await options.isReferenced(key)){result.referenced++;continue;}
      result.eligible++;
      if(apply){
        // Re-check immediately before deletion. Unknown reference state aborts the run.
        if(await options.isReferenced(key)){result.referenced++;continue;}
        await this.remove(key);result.removed++;
      }
    }
    this.reconciliationCursor=response.IsTruncated&&typeof response.NextContinuationToken==='string'?response.NextContinuationToken:undefined;
    return result;
  }
  close(){const client=this.client as ObjectClient&{destroy?:()=>void};client.destroy?.();}
}

export function configuredArtifactStorage(databaseName=process.env.DB_NAME??''):S3ArtifactStorage|undefined{
  const endpoint=process.env.OMNICOMPILE_ARTIFACT_ENDPOINT;
  if(!endpoint)return undefined;
  const url=new URL(endpoint);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('Invalid artifact endpoint configuration');
  function credential(variable:string){
    const file=process.env[variable];if(!file)throw new Error('Artifact storage credential files are required');
    const value=readFileSync(file,'utf8').trim();
    if(value.length<8||value.length>4096)throw new Error('Invalid artifact storage credential configuration');
    return value;
  }
  const client=new S3Client({endpoint:url.href,region:'us-east-1',forcePathStyle:true,maxAttempts:3,requestHandler:{connectionTimeout:3000,requestTimeout:15000},credentials:{accessKeyId:credential('OMNICOMPILE_ARTIFACT_ACCESS_KEY_FILE'),secretAccessKey:credential('OMNICOMPILE_ARTIFACT_SECRET_KEY_FILE')}});
  return new S3ArtifactStorage(client,process.env.OMNICOMPILE_ARTIFACT_BUCKET??'omnicompile-artifacts',databaseName);
}
