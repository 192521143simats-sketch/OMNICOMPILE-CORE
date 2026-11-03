import {it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import * as distribution from './distribution.js';
it('bounds concurrent package verification and recovers its slots after completion',async()=>{
 const root=await mkdtemp(join(tmpdir(),'omnicompile-distribution-budget-'));
 try{const path=join(root,'.runtime/distribution/OMNICOMPILE.apk'),bytes=Buffer.from('bounded fixture');await mkdir(join(root,'.runtime/distribution'),{recursive:true});await writeFile(path,bytes);
 const registry=new distribution.LocalDistributionRegistry(root,JSON.stringify([{platform:'ANDROID',version:'0.1.0',fileName:'OMNICOMPILE.apk',sha256:createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length,filePath:path,trust:'DEBUG_BUILD'}]));
 const results=await Promise.allSettled(Array.from({length:20},()=>registry.metadata()));expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(4);expect(results.filter(result=>result.status==='rejected').every(result=>(result as PromiseRejectedResult).reason.statusCode===503)).toBe(true);expect((await registry.metadata())[0]).toMatchObject({localAvailable:true});
 }finally{await rm(root,{recursive:true,force:true});}
});
it('serves only configured package bytes after checking their real checksum and size',async()=>{
 const root=await mkdtemp(join(tmpdir(),'omnicompile-distribution-'));
 try{
 const directory=join(root,'.runtime','distribution');await mkdir(directory,{recursive:true});const path=join(directory,'OMNICOMPILE.apk'),bytes=Buffer.from('isolated package bytes');await writeFile(path,bytes);
 const manifest=[{platform:'ANDROID',version:'0.1.1',fileName:'OMNICOMPILE.apk',sha256:createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length,filePath:path,trust:'DEBUG_BUILD'}];
 const registry=new (distribution as any).LocalDistributionRegistry(root,JSON.stringify(manifest));
 const metadata=await registry.metadata();expect(metadata[0]).toMatchObject({localAvailable:true,localDownloadUrl:'/api/distribution/ANDROID/download',trust:'DEBUG_BUILD'});expect(JSON.stringify(metadata)).not.toContain(root);
 const download=await registry.download('ANDROID');expect(download).not.toBeNull();const chunks=[];for await(const chunk of download.stream)chunks.push(chunk);expect(Buffer.concat(chunks)).toEqual(bytes);
 expect(await registry.download('../../secret')).toBeNull();await writeFile(path,Buffer.from('corrupted bytes'));expect(await registry.download('ANDROID')).toBeNull();expect((await registry.metadata())[0].localAvailable).toBe(false);
 }finally{await rm(root,{recursive:true,force:true});}
});
it('refuses paths outside the package roots even when they are otherwise valid files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'omnicompile-distribution-'));try{const path=join(root,'secret.apk');await writeFile(path,'secret');const raw=JSON.stringify([{platform:'ANDROID',version:'0.1.1',fileName:'secret.apk',sha256:'a'.repeat(64),sizeBytes:6,filePath:path,trust:'DEBUG_BUILD'}]);expect(()=>new (distribution as any).LocalDistributionRegistry(root,raw)).toThrow();}finally{await rm(root,{recursive:true,force:true});}
});
it('rejects a package directory redirected through a filesystem link',async()=>{
 const root=await mkdtemp(join(tmpdir(),'omnicompile-distribution-'));const outside=await mkdtemp(join(tmpdir(),'omnicompile-outside-'));
 try{const bytes=Buffer.from('outside package');await writeFile(join(outside,'OMNICOMPILE.apk'),bytes);await mkdir(join(root,'.runtime'),{recursive:true});await symlink(outside,join(root,'.runtime','distribution'),process.platform==='win32'?'junction':'dir');const raw=JSON.stringify([{platform:'ANDROID',version:'0.1.1',fileName:'OMNICOMPILE.apk',sha256:createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length,filePath:join(root,'.runtime','distribution','OMNICOMPILE.apk'),trust:'DEBUG_BUILD'}]);const registry=new (distribution as any).LocalDistributionRegistry(root,raw);expect(await registry.download('ANDROID')).toBeNull();expect(await registry.metadata()).toEqual([{platform:'ANDROID',localAvailable:false}]);}finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});
