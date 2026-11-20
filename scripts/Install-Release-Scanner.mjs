import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,writeFile,chmod,copyFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
export const VERSION='0.76.2';
// Official pinned checksums: https://github.com/aquasecurity/trivy/releases/download/v0.76.2/trivy_0.76.2_checksums.txt
export function releaseAsset(platform=process.platform,arch=process.arch){
  if(arch!=='x64'||!['linux','win32'].includes(platform))throw new Error('Unsupported release scanner platform');
  return platform==='linux'?{name:`trivy_${VERSION}_Linux-64bit.tar.gz`,binary:'trivy',sha256:'bc0fc726e017b8927a62b2d3531d7a84ee01769daf5c99ed866dced54089fdbf'}:{name:`trivy_${VERSION}_windows-64bit.zip`,binary:'trivy.exe',sha256:'691f737a7e5566a673c3a74dab9160552ec32101e953b659e5c77443d16dddb6'};
}
export function verifyArchive(bytes,expected){if(createHash('sha256').update(bytes).digest('hex')!==expected)throw new Error('Scanner checksum mismatch');}
const directory=resolve(fileURLToPath(new URL('../.runtime/security-tools/',import.meta.url)),`trivy-${VERSION}-${process.platform}-${process.arch}`);
export async function installScanner(){
  const asset=releaseAsset(),temp=await mkdtemp(join(tmpdir(),'omnicompile-scanner-'));
  try{
    const response=await fetch(`https://github.com/aquasecurity/trivy/releases/download/v${VERSION}/${asset.name}`,{signal:AbortSignal.timeout(180000)});
    if(!response.ok)throw new Error('Scanner download failed');
    const bytes=Buffer.from(await response.arrayBuffer());verifyArchive(bytes,asset.sha256);
    const archive=join(temp,asset.name);await writeFile(archive,bytes);
    const result=spawnSync('tar',['-xf',archive,'-C',temp,asset.binary],{windowsHide:true,timeout:60000});
    if(result.error||result.status!==0)throw new Error('Scanner extraction failed');
    await mkdir(directory,{recursive:true});await copyFile(join(temp,asset.binary),join(directory,asset.binary));await chmod(join(directory,asset.binary),0o755);
    await writeFile(join(directory,'verified.json'),JSON.stringify({version:VERSION,archiveSha256:asset.sha256,binarySha256:createHash('sha256').update(await readFile(join(directory,asset.binary))).digest('hex')}));
    console.log(`Installed checksum-verified Trivy ${VERSION}; no scans performed.`);
  }finally{await rm(temp,{recursive:true,force:true});}
}
export async function verifiedScanner(){
  const asset=releaseAsset(),binary=join(directory,asset.binary),manifest=JSON.parse(await readFile(join(directory,'verified.json'),'utf8'));
  if(manifest.version!==VERSION||manifest.archiveSha256!==asset.sha256)throw new Error('Scanner installation is not verified');
  verifyArchive(await readFile(binary),manifest.binarySha256);return binary;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))installScanner().catch(()=>{console.error('Release scanner installation failed.');process.exitCode=1;});
