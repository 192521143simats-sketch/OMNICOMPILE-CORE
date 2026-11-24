import {describe,it,expect} from 'vitest';
import {selectExecutionNetwork,workloadCapacityScore} from './network-placement.js';

describe('network admission and hybrid fallback',()=>{
  it('admits an eligible local network without requiring a managed pool',()=>{
    expect(selectExecutionNetwork([
      {networkId:'local-only',score:100,local:true,cloud:false},
      {networkId:'cloud',score:10,local:false,cloud:true}
    ],'HYBRID')).toBe('local-only');
    expect(selectExecutionNetwork([{networkId:'local-only',score:100,local:true,cloud:false}],'HYBRID')).toBe('local-only');
  });
  it('selects measured worker quality before the network location label',()=>{
    expect(selectExecutionNetwork([
      {networkId:'cloud',score:100,local:false,cloud:true},
      {networkId:'hybrid',score:10,local:true,cloud:true}
    ],'HYBRID')).toBe('cloud');
  });
  it('can queue in a network with a busy cloud peer and retains deterministic selection',()=>{
    expect(selectExecutionNetwork([{networkId:'queued-cloud',score:-1,local:false,cloud:true}],'HYBRID')).toBe('queued-cloud');
    const candidates=[{networkId:'b',score:10,local:true,cloud:false},{networkId:'a',score:10,local:true,cloud:false}];
    expect(selectExecutionNetwork(candidates,'LOCAL_ONLY')).toBe('a');
    expect(candidates[0]?.networkId).toBe('b');
  });
});

it('accounts for the number and quality of usable workers for a multi-task job',()=>{
 expect(workloadCapacityScore([100,1,1],1)).toBeGreaterThan(workloadCapacityScore([60,60,60],1)!);
 expect(workloadCapacityScore([100,1,1],4)).toBeLessThan(workloadCapacityScore([60,60,60],4)!);
 expect(workloadCapacityScore([80],1)).toBe(80);
 expect(workloadCapacityScore([],1)).toBeNull();
});
