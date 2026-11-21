import {expect,it} from 'vitest';
import {spawnSync} from 'node:child_process';
import {compilePython} from './pipeline.js';

const run=(source:string)=>{
 const result=spawnSync(process.env.PYTHON_EXECUTABLE??'python',['-I','-S','-c',source],{encoding:'utf8',timeout:10000,windowsHide:true});
 if(result.error)throw result.error;
 return {status:result.status,stdout:result.stdout,stderr:result.stderr};
};
it('eliminates unreachable statements and literal dead branches as a separate pass',async()=>{
 const source='def answer():\n    if False:\n        print("dead branch")\n    return 20+22\n    print("dead tail")\nprint(answer())\n';
 const result=await compilePython(source),evidence=result.metrics.optimizationEvidence as any;
 expect(result.optimizedSource).not.toContain('dead branch');expect(result.optimizedSource).not.toContain('dead tail');
 expect(evidence.deadCodeElimination).toMatchObject({status:'applied',removedStatements:2,removedInstructions:null});
 expect(run(result.optimizedSource)).toEqual(run(source));
});
it.each([
 'x=42\ndef f():\n    if False:\n        x=0\n    return x\ntry:\n    f()\nexcept UnboundLocalError:\n    print("scope retained")\n',
 'def f():\n    return\n    yield 1\nprint(type(f()).__name__)\n',
 'if False:\n    print("dead")\n"not a docstring"\nprint(__doc__)\n',
 'def effect():\n    print("effect")\n    return False\nif effect():\n    print("not reached at runtime")\nprint("done")\n',
 'def f():\n    try:\n        return 42\n        print("dead")\n    finally:\n        print("cleanup")\nprint(f())\n'
])('preserves binding, generator, docstring, condition effects and finally semantics',async source=>{
 const result=await compilePython(source);expect(run(result.optimizedSource)).toEqual(run(source));
});
it.each([
 'def outer():\n    x=42\n    def f():\n        print(locals())\n        return\n        print(x)\n    f()\nouter()\n',
 'class C:\n    def f(self):\n        print(sorted(locals()))\n        return\n        __class__\nC().f()\n'
])('retains unreachable free-variable references that affect live locals and closure cells',async source=>{
 const result=await compilePython(source);expect(run(result.optimizedSource)).toEqual(run(source));
});
it('reports no-change instead of inventing removed code',async()=>{
 const result=await compilePython('print(42)\n');
 expect((result.metrics.optimizationEvidence as any).deadCodeElimination).toMatchObject({status:'no-change',removedStatements:0});
});
it('removes unreachable calls to global functions without deleting their definitions',async()=>{
 const source='def helper():\n    print("preserved definition")\ndef f():\n    return 42\n    helper()\nprint(f())\n';
 const result=await compilePython(source);
 expect(result.optimizedSource).toContain('def helper():');
 expect(result.optimizedSource).not.toContain('    helper()');
 expect(run(result.optimizedSource)).toEqual(run(source));
});
