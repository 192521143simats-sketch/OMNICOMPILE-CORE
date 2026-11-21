/** Validate native Linux output before any executable is written or launched. */
export function assertLinuxExecutableArchitecture(bytes:Buffer,architecture:string=process.arch):void {
  const machine=architecture==='x64'?62:architecture==='arm64'?183:undefined;
  if(machine===undefined)throw new Error('The runner CPU architecture is not supported.');
  if(bytes.length<64||!bytes.subarray(0,4).equals(Buffer.from([127,69,76,70]))||
    bytes[4]!==2||bytes[5]!==1||bytes[6]!==1||![0,3].includes(bytes[7]!)||
    ![2,3].includes(bytes.readUInt16LE(16))||bytes.readUInt32LE(20)!==1||bytes.readUInt16LE(52)!==64){
    throw new Error('Invalid or unsupported Linux ELF executable header.');
  }
  if(bytes.readUInt16LE(18)!==machine)throw new Error('The Linux executable architecture does not match the runner.');
}
