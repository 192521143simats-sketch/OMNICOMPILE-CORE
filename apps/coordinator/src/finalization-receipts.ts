import {createHash} from 'node:crypto';
import {acknowledgeExecutionReceipt} from '@omnicompile/orchestration';

export function isPendingExecutionReceipt(cause:unknown):boolean {
  return (cause as {code?:string}|null)?.code==='EXECUTION_REQUEST_PENDING';
}

/** The broker independently binds this operation ID to the exact request payload. */
export function executionReceiptId(jobId:string):string {
  const bytes=createHash('sha256').update('omnicompile:program-execution:v1\0').update(jobId).digest().subarray(0,16);
  bytes[6]=(bytes[6]!&0x0f)|0x80;
  bytes[8]=(bytes[8]!&0x3f)|0x80;
  const hex=bytes.toString('hex');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}

export async function commitExecutionResult(commit:()=>Promise<void>,receiptId:string|undefined,onAckFailure:(cause:unknown)=>void):Promise<void>{
  await commit();
  if(receiptId)await acknowledgeExecutionReceipt(receiptId).catch(onAckFailure);
}
