import {createHash} from 'node:crypto';

export function workerExecutionReceiptId(taskId:string,attempt:number,operation:string):string{
  const identity=JSON.stringify([taskId,attempt,operation]);
  const bytes=createHash('sha256').update('omnicompile:worker-compiler:v1\0').update(identity).digest().subarray(0,16);
  bytes[6]=(bytes[6]!&15)|128;
  bytes[8]=(bytes[8]!&63)|128;
  const hex=bytes.toString('hex');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
