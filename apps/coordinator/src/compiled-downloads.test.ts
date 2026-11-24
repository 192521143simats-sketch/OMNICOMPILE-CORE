import {describe,it,expect} from 'vitest';
import {compiledDownloads} from './compiler-artifacts.js';
import {buildReports} from './build-report.js';
import type {StoredArtifact} from './database.js';
const artifact=(artifactType:StoredArtifact['artifactType'],fileName:string):StoredArtifact=>({artifactType,fileName,mediaType:'application/octet-stream',bytes:Buffer.from('fixture')});
describe('compiled output download contract',()=>{
 const all=[artifact('SOURCE','main.c'),artifact('GENERATED_SOURCE','optimized.c'),artifact('EXECUTABLE','program'),artifact('BYTECODE','program.pyc'),artifact('BYTECODE','Main.class'),artifact('JAR','Main.jar'),artifact('BUILD_REPORT_JSON','report.json')];
 it('selects native C output, Python bytecode and one complete Java archive',()=>{
  expect(compiledDownloads('c',all).map(item=>item.fileName)).toEqual(['program']);
  expect(compiledDownloads('python',all.filter(item=>item.fileName!=='Main.class')).map(item=>item.fileName)).toEqual(['program.pyc']);
  expect(compiledDownloads('java',all).map(item=>item.fileName)).toEqual(['Main.jar']);
 });
 it.each(['c','python','java'] as const)('report lists offered compiled files and PDF only for %s',async language=>{
  const inputs=language==='python'?all.filter(item=>item.fileName!=='Main.class'):all;
  const report=JSON.parse((await buildReports({language,sourceName:'main',source:'original',artifacts:inputs}))[0]!.bytes.toString());
  expect(report.output.generatedFiles).toEqual([...compiledDownloads(language,inputs).map(item=>item.fileName),'build-report.pdf']);
  expect(report.output.generatedFiles).not.toContain('optimized.c');
  expect(report.output.generatedFiles).not.toContain('report.json');
  expect(report.output.howToUse).toMatch(language==='c'?/operating system/:language==='python'?/CPython/:/java -jar/);
 });
});
