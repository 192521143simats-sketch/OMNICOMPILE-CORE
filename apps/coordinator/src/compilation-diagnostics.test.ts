import {expect,it} from 'vitest';
import {formatCompilationFailure} from './compilation-diagnostics.js';
it('persists compiler line and column before diagnostic reports are fetched',()=>{
  expect(formatCompilationFailure([{severity:'error',message:'expected expression',line:3,column:7}]))
    .toBe('Line 3, column 7: expected expression');
});
it('does not duplicate existing location prefixes or invent unavailable positions',()=>{
  expect(formatCompilationFailure([{severity:'error',message:'Line 3: expected expression',line:3,column:7}]))
    .toBe('Line 3, column 7: expected expression');
  expect(formatCompilationFailure([{severity:'error',message:'Compiler unavailable',line:null,column:null}]))
    .toBe('Source location unavailable: Compiler unavailable');
  expect(formatCompilationFailure([{severity:'error',message:'Line 3, column 7: expected expression',line:null,column:null}]))
    .toBe('Line 3, column 7: expected expression');
});
