import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {VERSION,verifiedScanner} from './Install-Release-Scanner.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!name.toUpperCase().startsWith('TRIVY_')));
function run(command,args,cwd){return spawnSync(command,args,{cwd,env,encoding:'utf8',timeout:1200000,maxBuffer:32*1024*1024,windowsHide:true});}
function checked(command,args,cwd){const result=run(command,args,cwd);if(result.error||result.status!==0)throw new Error('Required scan operation failed');return result.stdout.trim();}
export function assertScannerResult(result,report){
  if(result.error||![0,1].includes(result.status))throw new Error('Scanner execution failed');
  const omittedResults=report&&!Object.hasOwn(report,'Results')&&typeof report.ArtifactName==='string'&&report.ArtifactName.length>0&&['filesystem','container_image'].includes(report.ArtifactType);
  if(!report||report.SchemaVersion!==2||(!omittedResults&&!Array.isArray(report.Results))||(report.Results??[]).some(r=>!r||typeof r!=='object'||(r.Secrets!==undefined&&!Array.isArray(r.Secrets))||(r.Vulnerabilities!==undefined&&!Array.isArray(r.Vulnerabilities))))throw new Error('Invalid scanner report');
}
export function sanitizeReport(report,mode){
  const findings=(report.Results??[]).flatMap(result=>(mode==='source'?result.Secrets??[]:result.Vulnerabilities??[]).map(item=>mode==='source'?{target:result.Target,rule:item.RuleID,severity:item.Severity,line:item.StartLine}:{target:result.Target,id:item.VulnerabilityID,package:item.PkgName,installed:item.InstalledVersion,fixed:item.FixedVersion,severity:item.Severity}));
  return {scanner:`Trivy ${VERSION}`,status:findings.length?'failed':'passed',findings};
}
export function summarizeScan(result,report,mode){
  assertScannerResult(result,report);const safe=sanitizeReport(report,mode);
  if(result.status!==0)safe.status='failed';return safe;
}
export function imageCommands(id,report,sbom){
  if(!/^sha256:[a-f0-9]{64}$/.test(id))throw new Error('Immutable Docker image ID required');
  return [['image','--image-src','docker','--scanners','vuln','--severity','HIGH,CRITICAL','--exit-code','1','--format','json','--output',report,id],['image','--image-src','docker','--format','cyclonedx','--output',sbom,id]];
}
export async function verifyReleaseSecurity(mode){
  if(!['source','images'].includes(mode))throw new Error('Expected source or images mode');
  const evidence=join(root,'.runtime/security-evidence');await mkdir(evidence,{recursive:true});
  const summary=join(evidence,`${mode}-summary.json`);await writeFile(summary,JSON.stringify({status:'incomplete',scanner:`Trivy ${VERSION}`}));
  const temp=await mkdtemp(join(tmpdir(),'omnicompile-security-'));
  try{
    const binary=await verifiedScanner(),empty=join(temp,'empty.yaml'),ignore=join(temp,'empty.ignore');
    await writeFile(empty,'{}\n');await writeFile(ignore,'');const common=['--config',empty,'--quiet'];
    let failed=false;const scans=[];
    async function scan(args,metadata,name){
      const raw=join(temp,`${name}.json`),command=args(raw),result=run(binary,[...common,command[0],'--ignorefile',ignore,...command.slice(1)],temp),report=JSON.parse(await readFile(raw,'utf8'));
      const safe={...summarizeScan(result,report,mode),...metadata};if(safe.status==='failed')failed=true;
      await writeFile(join(evidence,`${mode}-${name}.json`),JSON.stringify(safe,null,2));scans.push(safe);
    }
    if(mode==='source'){
      const archive=join(temp,'source.tar'),source=join(temp,'source');await mkdir(source);
      const commit=checked('git',['rev-parse','HEAD'],root);checked('git',['archive','--format=tar','--output',archive,commit],root);checked('tar',['-xf',archive,'-C',source],temp);
      await scan(raw=>['fs','--scanners','secret','--exit-code','1','--format','json','--output',raw,source],{commit},'committed');
    }else{
      const images=[...new Set(checked('docker',['compose','config','--images'],root).split(/\r?\n/).filter(Boolean))];if(!images.length)throw new Error('No release images found');
      for(const [index,image]of images.entries()){
        const id=checked('docker',['image','inspect','--format','{{.Id}}',image],root),sbom=join(temp,`image-${index}.cdx.json`);
        await scan(raw=>imageCommands(id,raw,sbom)[0],{image,imageId:id},`image-${index}`);
        const command=imageCommands(id,'unused',sbom)[1];checked(binary,[...common,command[0],'--ignorefile',ignore,...command.slice(1)],temp);
        const bom=JSON.parse(await readFile(sbom,'utf8'));if(bom.bomFormat!=='CycloneDX'||!Array.isArray(bom.components)||!bom.components.length)throw new Error('Missing or invalid image SBOM');
        await writeFile(join(evidence,`image-${index}.cdx.json`),JSON.stringify(bom));
      }
    }
    await writeFile(summary,JSON.stringify({status:failed?'failed':'passed',scanner:`Trivy ${VERSION}`,scans},null,2));if(failed)throw new Error('Release security findings block release');
    console.log(`Release ${mode} security scan passed.`);
  }finally{await rm(temp,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))verifyReleaseSecurity(process.argv[2]).catch(()=>{console.error('Release security verification failed; release is blocked.');process.exitCode=1;});
