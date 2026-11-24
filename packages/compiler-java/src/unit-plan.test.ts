import {it,expect} from 'vitest';
import {planJavaUnits,aggregateJavaUnits} from './unit-plan.js';
import {compileJava} from './pipeline.js';
it('compiles interdependent methods with declaration context and links only verified bodies',async()=>{
 const source='public class Invoice { final int rate; Invoice(){rate=3;} static int subtotal(int x){return x*(2+3);} static int invoice(int x){return subtotal(x)+1;} public static void main(String[] a){System.out.println(invoice(4));} }';
 const plan=await planJavaUnits(source,'Invoice.java');expect(plan.units).toHaveLength(3);expect(plan.methods.map(item=>item.name)).toEqual(['subtotal','invoice','main']);
 expect(plan.units[0]!.source).toContain('Invoice(){rate=3;}');expect(plan.units[0]!.source).toContain('throw null;');
 const results=[];for(const unit of plan.units)results.push({operation:'java_compile',generatedSource:(await compileJava(unit.source,'Invoice.java')).generatedSource});
 const result=await aggregateJavaUnits(source,'Invoice.java',plan,results);expect(result.metrics.partitioning.assemblyMatched).toBe(true);expect(result.generatedSource).toContain('subtotal(x)+1');
 const altered=structuredClone(results);altered[0]!.generatedSource+='\nclass UntrustedExtra {}';await expect(aggregateJavaUnits(source,'Invoice.java',plan,altered)).rejects.toThrow('independently compiled');
},120000);
it('keeps nested local classes in their method, ignores abstract methods, and never executes initializers',async()=>{
 const source='public class Scope { static { if(System.nanoTime()>0)throw new Error("must not run"); } static int outer(){class Local { int value(){return 3;} } return new Local().value();} static int next(){return outer()+1;} }';
 const plan=await planJavaUnits(source,'Scope.java');expect(plan.methods.map(item=>item.name)).toEqual(['outer','next']);expect(plan.units[0]!.source).toContain('class Local');
 const atomic=await planJavaUnits('public interface Ledger { int balance(); }','Ledger.java');expect(atomic.units).toHaveLength(1);expect(atomic.methods).toEqual([]);
},60000);

it('validates every original method before replacing any body with compile-only context',async()=>{
 await expect(planJavaUnits('public class Broken { int first(){return 1;} int second(){return missingName;} }','Broken.java')).rejects.toMatchObject({diagnostics:expect.arrayContaining([expect.objectContaining({severity:'error'})])});
},30000);
