import {afterEach,expect,it,vi} from 'vitest';
import {commitExecutionResult,executionReceiptId} from './finalization-receipts.js';
import {executeIsolated} from './isolated-execution.js';
import {acknowledgeExecutionReceipt,requestDockerJob} from '@omnicompile/orchestration';

vi.mock('@omnicompile/orchestration',()=>({acknowledgeExecutionReceipt:vi.fn(),requestDockerJob:vi.fn()}));
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});

it('uses one stable receipt identity per compilation job',()=>{
  const id=executionReceiptId('JOB-AAA');
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(executionReceiptId('JOB-AAA')).toBe(id);
  expect(executionReceiptId('JOB-AAB')).not.toBe(id);
});

it('defers a pending keyed execution without acknowledging or publishing unavailable',async()=>{
  vi.stubEnv('OMNICOMPILE_EXECUTOR_URL','http://broker.invalid');
  const id=executionReceiptId('JOB-AAA');
  const pending=Object.assign(Error('pending'),{code:'EXECUTION_REQUEST_PENDING'});
  vi.mocked(requestDockerJob).mockRejectedValueOnce(pending);
  await expect(executeIsolated({language:'python',sourceName:'main.py',generatedSource:'print(42)',artifact:null,requestId:id})).rejects.toBe(pending);
  expect(requestDockerJob).toHaveBeenCalledWith(expect.objectContaining({kind:'execute'}),undefined,id);
  expect(acknowledgeExecutionReceipt).not.toHaveBeenCalled();
});

it('acknowledges after commit and preserves a receipt if commit fails',async()=>{
  const id=executionReceiptId('JOB-AAA');
  const ack=vi.mocked(acknowledgeExecutionReceipt);
  ack.mockReset();
  const onAckFailure=vi.fn();
  await expect(commitExecutionResult(async()=>{throw Error('commit failed');},id,onAckFailure)).rejects.toThrow('commit failed');
  expect(ack).not.toHaveBeenCalled();
  ack.mockRejectedValueOnce(Error('broker disconnected'));
  await commitExecutionResult(async()=>expect(ack).not.toHaveBeenCalled(),id,onAckFailure);
  expect(ack).toHaveBeenCalledWith(id);
  expect(onAckFailure).toHaveBeenCalledTimes(1);
});
