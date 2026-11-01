import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {buildReports} from './build-report.js';

const source=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
describe('OmniCompile Core product identity with stable engineering identities',()=>{
  it('generates genuinely branded reports without altering program-specific results',async()=>{
    const files=await buildReports({language:'python',sourceName:'invoice.py',source:'total = 2 + 3\n',artifacts:[],status:'FAILED',diagnostics:[{severity:'error',message:'A real diagnostic',line:1}]});
    const report=JSON.parse(files[0]!.bytes.toString());
    expect(report.title).toBe('OmniCompile Core - Build Report');
    expect(report.reportGeneratedBy).toBe('OmniCompile Core');
    expect(report.programInformation.errors).toBe(1);
    expect(report.finalResult.status).toBe('FAILED');
    expect(files[1]!.bytes.subarray(0,4).toString()).toBe('%PDF');
  });
  it('brands web and native surfaces while retaining installed worker identities',()=>{
    expect(source('../../web/index.html')).toContain('<title>OmniCompile Core</title>');
    expect(source('../../web/src/main.tsx')).toContain('<span>OC</span> OmniCompile Core');
    expect(source('../../windows-worker/index.html')).toContain('<title>OmniCompile Core Worker</title>');
    expect(source('../../android-worker/app/src/main/AndroidManifest.xml')).toContain('android:label="OmniCompile Core Worker"');
    expect(source('../../android-worker/app/build.gradle.kts')).toContain('applicationId = if (isolatedAcceptance) "org.gridx.worker.acceptance" else "org.gridx.worker"');
    const packaging=source('../../../scripts/Build-Windows-Worker.mjs');
    expect(packaging).toContain("productName:'OmniCompile Core Worker'");
    expect(packaging).toContain("appId:'org.gridx.worker'");
    expect(packaging).toContain("executableName:'GRID-X Worker'");
    expect(packaging).toContain("letters=['01110 01111','10001 10000','10001 10000','10001 10000','01110 01111']");
  });
});
