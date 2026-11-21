import {it,expect} from 'vitest';
import {compilePython} from './pipeline.js';
it('reports real AST before and after counts and actual bytecode size',async()=>{
 const result=await compilePython('value = 20 + 22\nprint(value)\n');const e=result.metrics.optimizationEvidence!;
 expect(result.optimizedSource).toContain('42');expect(e.transformations).toBeGreaterThan(0);expect(e.measurement.before).toBe(result.metrics.originalAstNodes);expect(e.measurement.after).toBe(result.metrics.optimizedAstNodes);expect(e.artifactBytes).toBe(result.bytecode.length);expect(e.runtimeSpeedupPercent).toBeNull();
});
it('reports no transformations honestly when there is no eligible expression',async()=>{
 const result=await compilePython('print(42)\n');expect(result.metrics.optimizationEvidence?.transformations).toBe(0);
});
