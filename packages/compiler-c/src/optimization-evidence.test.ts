import {it,expect} from 'vitest';
import {compileCSource} from './codegen.js';
it('reports actual O2 and O0 binary sizes without asserting runtime speedup',async()=>{
 const result=await compileCSource('int main(void){int x=20+22;return x;}','evidence.c');
 const e=result.optimizationEvidence!;expect(e.language).toBe('c');expect(e.compiler.options).toContain('-O2');expect(e.compiler.version).toMatch(/gcc/i);expect(e.artifactBytes).toBe(result.bytes.length);expect(e.runtimeSpeedupPercent).toBeNull();expect(e.transformations).toBeNull();expect(e.measurement?.before).toBeGreaterThan(0);expect(e.measurement?.after).toBe(result.bytes.length);expect(e.measurement?.reductionPercent).toBeCloseTo(100*(e.measurement!.before-result.bytes.length)/e.measurement!.before);
},30000);
it('does not reject valid O2 output when a program explicitly forbids an O0 baseline',async()=>{
 const result=await compileCSource('#ifndef __OPTIMIZE__\n#error baseline unavailable\n#endif\nint main(void){return 0;}');
 expect(result.bytes.length).toBeGreaterThan(0);expect(result.optimizationEvidence?.measurement).toBeNull();
},30000);
