import {expect,it} from 'vitest';
import {compilePython} from './pipeline.js';
import {planPythonUnits,aggregatePythonUnits} from './unit-plan.js';
it('keeps future flags, decorators, nested scopes and statement order without executing source',async()=>{
 const source='"Billing module"\nfrom __future__ import annotations\nimport decimal\n@decorate\ndef amount(x: 2+3):\n    def nested():\n        return x\n    return nested()\nprint(amount(1))\n';
 const plan=await planPythonUnits(source,'invoice.py');
 expect(plan.units).toHaveLength(3);expect(plan.prefix).toContain('from __future__ import annotations');expect(plan.units[1]?.source).toContain('@decorate\ndef amount');expect(plan.units[1]?.source).toContain('def nested');expect(plan.units[2]?.source).toContain('print(amount(1))');
 expect(plan.units[1]?.originalStartLine).toBe(4);
});
it('does not duplicate semicolon statements or promote a later string into a docstring',async()=>{
 const source='x=1; y=2\nprint(x+y)\n';const plan=await planPythonUnits(source,'main.py');
 expect(plan.units).toHaveLength(2);expect(plan.units[0]?.source).toBe('pass\nx=1; y=2\n');
 const atomic=await planPythonUnits('"doc"; x=1\nprint(x)\n','main.py');expect(atomic.units).toHaveLength(1);expect(atomic.prefix).toBe('');
});
it('validates the whole module binding context before creating independent compilation units',async()=>{
 await expect(planPythonUnits('x=1\nreturn x\n','main.py')).rejects.toMatchObject({diagnostics:[expect.objectContaining({line:2})]});
});

it('links interdependent functions, future annotations and ordered side effects without running them',async()=>{
 const source='"Invoice"\nfrom __future__ import annotations\nRATE=2+3\ndef subtotal(x):\n    return x*RATE\ndef invoice(x):\n    return subtotal(x)+1\nraise RuntimeError("only at runtime")\n';
 const plan=await planPythonUnits(source,'invoice.py');
 const results=await Promise.all(plan.units.map(async unit=>({operation:'python_compile',generatedSource:(await compilePython(unit.source,undefined,'invoice.py')).optimizedSource})));
 const result=await aggregatePythonUnits(source,'invoice.py',JSON.parse(JSON.stringify(plan)),results);
 expect(result.metrics.partitioning.assemblyMatched).toBe(true);expect(result.metrics.partitioning.unitCount).toBe(4);
 expect(result.generatedSource).toContain('return subtotal(x) + 1');
 const altered=structuredClone(results);altered[1]!.generatedSource+='\nprint("tampered")';
 await expect(aggregatePythonUnits(source,'invoice.py',plan,altered)).rejects.toThrow('independently compiled');
});
it('preserves later string expressions and nested closure bindings',async()=>{
 const source='value=1\n"not a module docstring"\ndef outer():\n    x=1\n    def inner():\n        return x\n    return inner\nprint(outer()())\n';
 const plan=await planPythonUnits(source,'scopes.py');const results=await Promise.all(plan.units.map(async unit=>({operation:'python_compile',generatedSource:(await compilePython(unit.source,undefined,'scopes.py')).optimizedSource})));
 const result=await aggregatePythonUnits(source,'scopes.py',plan,results);expect(result.metrics.partitioning.assemblyMatched).toBe(true);
});
