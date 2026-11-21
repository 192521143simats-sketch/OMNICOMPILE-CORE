import {expect,it} from 'vitest';
import {optimizeCIR} from './optimize.js';
import type {CIntermediateRepresentation,IRInstruction} from './ir.js';
const ir=(instructions:IRInstruction[]):CIntermediateRepresentation=>({kind:'OmniCompileCIR',version:1,functions:[{name:'main',returnType:'int',parameters:[],instructions}]});
it('eliminates unreachable instructions after return but preserves reachable side effects',()=>{
 const result=optimizeCIR(ir([{op:'call',callee:'effect',dest:null,arguments:[]},{op:'const',dest:'%t0',value:42},{op:'return',value:'%t0'},{op:'call',callee:'unreachable',dest:null,arguments:[]}]));
 expect(result.ir.functions[0]!.instructions.some(i=>i.op==='call'&&i.callee==='effect')).toBe(true);
 expect(result.ir.functions[0]!.instructions.some(i=>i.op==='call'&&i.callee==='unreachable')).toBe(false);
 expect(result.report.deadInstructionsRemoved).toBe(1);
});
it('follows labels and both branch targets without deleting loop-carried values',()=>{
 const result=optimizeCIR(ir([{op:'jump',target:'live'},{op:'call',callee:'dead',dest:null,arguments:[]},{op:'label',name:'live'},{op:'const',dest:'x',value:1},{op:'branch',condition:'x',thenLabel:'done',elseLabel:'live'},{op:'label',name:'done'},{op:'return',value:'x'}]));
 expect(result.report.deadInstructionsRemoved).toBe(1);
 expect(result.ir.functions[0]!.instructions.some(i=>i.op==='const'&&i.dest==='x')).toBe(true);
 expect(result.ir.functions[0]!.instructions.some(i=>i.op==='branch')).toBe(true);
});
it('does not guess reachability for unresolved control-flow labels',()=>{
 const result=optimizeCIR(ir([{op:'jump',target:'unknown'},{op:'call',callee:'retain',dest:null,arguments:[]}]));
 expect(result.report.deadInstructionsRemoved).toBe(0);
});
