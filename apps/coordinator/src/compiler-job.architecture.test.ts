import {afterEach,describe,expect,it,vi} from 'vitest';
import {spawn} from 'node:child_process';
import {compileCSource} from '@omnicompile/compiler-c';
import {executeProgram} from './compiler-job.js';

vi.mock('node:child_process',async original=>({...await original<typeof import('node:child_process')>(),spawn:vi.fn(()=>{throw new Error('PROGRAM_START_ATTEMPTED');})}));
vi.mock('@omnicompile/compiler-c',async original=>({...await original<typeof import('@omnicompile/compiler-c')>(),compileCSource:vi.fn()}));

function elf(machine:number){const bytes=Buffer.alloc(64);bytes.write('\x7fELF');bytes[4]=2;bytes[5]=1;bytes[6]=1;bytes.writeUInt16LE(2,16);bytes.writeUInt16LE(machine,18);bytes.writeUInt32LE(1,20);bytes.writeUInt16LE(64,52);return bytes;}
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
describe('execution runner architecture boundary',()=>{
 it('rejects foreign ELF before starting any program or recompiling supplied ELF',async()=>{
  vi.stubEnv('OMNICOMPILE_COMPILER_SANDBOX_EXECUTABLE','/sandbox');
  const foreign=elf(process.arch==='arm64'?62:183);
  await expect(executeProgram({language:'c',sourceName:'main.c',generatedSource:'int main(void){return 0;}',artifactBase64:foreign.toString('base64')})).rejects.toThrow(/architecture/);
  expect(spawn).not.toHaveBeenCalled();expect(compileCSource).not.toHaveBeenCalled();
 });
 it('also validates a newly compiled output before starting it',async()=>{
  vi.stubEnv('OMNICOMPILE_COMPILER_SANDBOX_EXECUTABLE','/sandbox');
  vi.mocked(compileCSource).mockResolvedValue({bytes:elf(process.arch==='arm64'?62:183)} as Awaited<ReturnType<typeof compileCSource>>);
  await expect(executeProgram({language:'c',sourceName:'main.c',generatedSource:'int main(void){return 0;}',artifactBase64:Buffer.from('MZ').toString('base64')})).rejects.toThrow(/architecture/);
  expect(compileCSource).toHaveBeenCalledOnce();expect(spawn).not.toHaveBeenCalled();
 });
});
