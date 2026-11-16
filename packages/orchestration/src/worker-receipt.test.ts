import {expect,it} from 'vitest';
import {workerExecutionReceiptId} from './worker-receipt.js';

it('assigns an independent, stable receipt to each compiler task attempt',()=>{
  const id=workerExecutionReceiptId('TASK-a',1,'java_compile');
  expect(id).toMatch(/^[a-f0-9-]{14}8[a-f0-9-]{21}$/);
  expect(workerExecutionReceiptId('TASK-a',1,'java_compile')).toBe(id);
  expect(workerExecutionReceiptId('TASK-a',2,'java_compile')).not.toBe(id);
  expect(workerExecutionReceiptId('TASK-b',1,'java_compile')).not.toBe(id);
  expect(workerExecutionReceiptId('TASK-a',1,'python_compile')).not.toBe(id);
});
