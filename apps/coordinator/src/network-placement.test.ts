import {describe,it,expect} from 'vitest';
import {selectExecutionNetwork} from './network-placement.js';

describe('network admission and hybrid fallback',()=>{
  it('does not strand a hybrid job in a local-only network',()=>{
    expect(selectExecutionNetwork([
      {networkId:'local-only',score:100,local:true,cloud:false},
      {networkId:'cloud',score:10,local:false,cloud:true}
    ],'HYBRID')).toBe('cloud');
    expect(selectExecutionNetwork([{networkId:'local-only',score:100,local:true,cloud:false}],'HYBRID')).toBeNull();
  });
  it('prefers local participation within a network that supports its own cloud fallback',()=>{
    expect(selectExecutionNetwork([
      {networkId:'cloud',score:100,local:false,cloud:true},
      {networkId:'hybrid',score:10,local:true,cloud:true}
    ],'HYBRID')).toBe('hybrid');
  });
  it('can queue in a network with a busy cloud peer and retains deterministic selection',()=>{
    expect(selectExecutionNetwork([{networkId:'queued-cloud',score:-1,local:false,cloud:true}],'HYBRID')).toBe('queued-cloud');
    const candidates=[{networkId:'b',score:10,local:true,cloud:false},{networkId:'a',score:10,local:true,cloud:false}];
    expect(selectExecutionNetwork(candidates,'LOCAL_ONLY')).toBe('a');
    expect(candidates[0]?.networkId).toBe('b');
  });
});
