import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {planCUnits,aggregateCUnits} from './unit-plan.js';
it('compiles pointer/array/interdependent factory functions with intact header and declaration context',async()=>{
 const source=await readFile(new URL('../../../samples/case-studies/c/factory_quality.c',import.meta.url),'utf8');const plan=await planCUnits(source,'factory.c');
 expect(plan.functions.map(item=>item.name)).toEqual(['within','rejects','energy','main']);expect(plan.units).toHaveLength(4);expect(plan.units[0]!.source).toContain('#include <stdio.h>');
 const results=plan.units.map(unit=>({operation:'c_compile',generatedSource:unit.source}));const output=await aggregateCUnits(source,'factory.c',plan,results);expect(output.generatedSource).toBe(source);expect(output.metrics.partitioning.unitCount).toBe(4);
 results[0]!.generatedSource+='\nint untrusted;';await expect(aggregateCUnits(source,'factory.c',plan,results)).rejects.toThrow('independently compiled');
},60000);
it('retains preprocessing-sensitive source atomically and never mistakes braces in literals for function boundaries',async()=>{
 const guarded='#define FLAG 1\n#if FLAG\nint a(){return 1;}\n#else\nint a(){return 2;}\n#endif\nint main(){return a()-1;}\n';const atomic=await planCUnits(guarded,'guarded.c');expect(atomic.units).toHaveLength(1);
 const source='int value(){const char *s="} { (";return s[0];}\nint main(){return value()==125?0:1;}';const plan=await planCUnits(source,'literal.c');expect(plan.functions.map(item=>item.name)).toEqual(['value','main']);
},30000);
it('reports invalid original C before any masking can hide its error',async()=>{await expect(planCUnits('int good(){return 1;} int main(){return unknown;}','broken.c')).rejects.toMatchObject({diagnostics:expect.arrayContaining([expect.objectContaining({severity:'error'})])});},30000);

it('preserves a macro defined inside a function for later dependent functions',async()=>{
 const source='int setup(void){\n#define OFFSET 3\nreturn 0;\n}\nint amount(int x){return x+OFFSET;}\nint main(void){return amount(1)==4?0:1;}\n';
 const plan=await planCUnits(source,'context.c');expect(plan.units).toHaveLength(1);expect(plan.units[0]!.source).toBe(source);
},30000);
