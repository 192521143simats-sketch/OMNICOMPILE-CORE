import {describe,expect,it} from 'vitest';
import {assertLinuxExecutableArchitecture} from './executable-architecture.js';
function elf(machine:number){const bytes=Buffer.alloc(64);bytes.write('\x7fELF');bytes[4]=2;bytes[5]=1;bytes[6]=1;bytes.writeUInt16LE(2,16);bytes.writeUInt16LE(machine,18);bytes.writeUInt32LE(1,20);bytes.writeUInt16LE(64,52);return bytes;}
describe('Linux ELF architecture',()=>{
 it.each([['x64',62],['arm64',183]] as const)('accepts matching %s executable and PIE headers',(arch,machine)=>{
  const bytes=elf(machine);expect(()=>assertLinuxExecutableArchitecture(bytes,arch)).not.toThrow();
  bytes.writeUInt16LE(3,16);bytes[7]=3;expect(()=>assertLinuxExecutableArchitecture(bytes,arch)).not.toThrow();
 });
 it.each([['x64',183],['arm64',62]] as const)('rejects foreign machine on %s',(arch,machine)=>expect(()=>assertLinuxExecutableArchitecture(elf(machine),arch)).toThrow(/does not match/));
 it.each([0,4,18,63])('rejects a truncated %i-byte ELF',size=>expect(()=>assertLinuxExecutableArchitecture(elf(62).subarray(0,size),'x64')).toThrow(/header/));
 it.each([4,5,6,7,16,20,52])('rejects malformed or unsupported header field at byte %i',offset=>{
  const bytes=elf(62);bytes[offset]=255;expect(()=>assertLinuxExecutableArchitecture(bytes,'x64')).toThrow(/header/);
 });
 it('fails closed on an unsupported runner CPU',()=>expect(()=>assertLinuxExecutableArchitecture(elf(62),'riscv64')).toThrow(/not supported/));
});
