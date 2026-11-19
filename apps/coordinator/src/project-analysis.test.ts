import {describe,expect,it} from 'vitest';
import {analyzeProject} from './project-analysis.js';
const file=(path:string,content:string)=>({path,content});
describe('conservative project dependency analysis',()=>{
  it('detects local C includes and SCC cycles without treating cycles as invalid',()=>{
    const result=analyzeProject({language:'c',files:[file('main.c','#include "inc/a.h"\n#include <stdio.h>'),file('inc/a.h','#include "b.h"'),file('inc/b.h','#include "a.h"')]});
    expect(result.status).toBe('REQUIRES_TOOLCHAIN_VALIDATION');
    expect(result.files[0]).toMatchObject({path:'main.c',dependencies:['inc/a.h'],externalDependencies:['stdio.h']});
    expect(result.groups).toContainEqual(['inc/a.h','inc/b.h']);
  });
  it('ignores commented and string-literal directives and reports missing quoted C includes',()=>{
    const result=analyzeProject({language:'c',files:[file('main.c','// #include "fake.h"\nchar*s="#include \\"other.h\\"";\n/* #include "fake2.h" */\n#include "missing.h"')]});
    expect(result.files[0]?.dependencies).toEqual([]);
    expect(result.status).toBe('REQUIRES_TOOLCHAIN_VALIDATION');
    expect(result.diagnostics.filter(d=>d.code==='C_INCLUDE_UNRESOLVED')).toHaveLength(1);
  });
  it('handles Python package-relative imports and labels unresolved imports conservatively',()=>{
    const result=analyzeProject({language:'python',files:[file('pkg/__init__.py',''),file('pkg/main.py','from . import util\nimport thirdparty\ns="import fake"\n# import nope'),file('pkg/util.py','from . import main')]});
    expect(result.files.find(f=>f.path==='pkg/main.py')).toMatchObject({dependencies:['pkg/__init__.py','pkg/util.py'],externalDependencies:['thirdparty']});
    expect(result.groups).toContainEqual(['pkg/main.py','pkg/util.py']);
    expect(result.status).toBe('REQUIRES_TOOLCHAIN_VALIDATION');
    expect(result.diagnostics.some(d=>d.code==='PYTHON_IMPORT_UNCERTAIN')).toBe(true);
  });
  it('groups same-package Java sources conservatively and detects explicit imports',()=>{
    const result=analyzeProject({language:'java',files:[file('src/p/A.java','package p; import q.B; class A {}'),file('src/p/C.java','package p; class C {}'),file('src/q/B.java','package q; import java.util.List; class B {}')]});
    expect(result.files.find(f=>f.path==='src/p/A.java')?.dependencies).toEqual(['src/p/C.java','src/q/B.java']);
    expect(result.groups).toContainEqual(['src/p/A.java','src/p/C.java']);
    expect(result.files.find(f=>f.path==='src/q/B.java')?.externalDependencies).toEqual(['java.util.List']);
    expect(result.notes.join(' ')).toMatch(/SCC/);
  });
  it('returns deterministic bounded results and UTF-8 source bytes',()=>{
    const input={language:'python' as const,files:[file('b.py','import a\n#é'),file('a.py','import b')]};
    expect(analyzeProject(input).groups).toEqual([['a.py','b.py']]);
    expect(analyzeProject(input).sourceBytes).toBe(new TextEncoder().encode('import a\n#éimport b').length);
    expect(()=>analyzeProject({...input,files:[file('../escape.py','')]})).toThrow();
  });
  it('keeps multiline literals and comments opaque for Python and Java',()=>{
    const python=analyzeProject({language:'python',files:[file('main.py','text="""\nimport phantom\nfrom . import fake\n"""\n# import absent')]});
    expect(python.files[0]?.externalDependencies).toEqual([]);
    const java=analyzeProject({language:'java',files:[file('A.java','/* import absent.Fake; */ class A {String s="import fake.No;";}')]});
    expect(java.files[0]?.externalDependencies).toEqual([]);
  });
  it('bounds dependency output and labels the resulting uncertainty',()=>{
    const result=analyzeProject({language:'python',files:[file('main.py',Array.from({length:1000},(_,i)=>'import external'+i).join('\n'))]});
    expect(result.files[0]?.externalDependencies).toHaveLength(128);
    expect(result.diagnostics.some(d=>d.code==='DEPENDENCY_SCAN_LIMIT')).toBe(true);
  });
  it('requires toolchain validation for macros and external includes without inventing local dependencies',()=>{
    const result=analyzeProject({language:'c',files:[file('main.c','#include PLATFORM_HEADER\n#include <external/library.h>')]});
    expect(result.status).toBe('REQUIRES_TOOLCHAIN_VALIDATION');
    expect(result.files[0]?.dependencies).toEqual([]);
    expect(result.files[0]?.externalDependencies).toEqual(['external/library.h']);
    expect(result.diagnostics.some(d=>d.code==='C_INCLUDE_UNCERTAIN')).toBe(true);
  });
  it('emits SCC groups in deterministic dependency-first order',()=>{
    const result=analyzeProject({language:'c',files:[file('main.c','#include "z.h"'),file('z.h','')]});
    expect(result.groups).toEqual([['z.h'],['main.c']]);
  });
  it('treats missing conditionally included headers as uncertain rather than invalid',()=>{
    for(const condition of ['#if 0','#ifdef OPTIONAL_FEATURE']){
      const result=analyzeProject({language:'c',files:[file('main.c',condition+'\n#include "optional.h"\n#endif')]});
      expect(result.status).toBe('REQUIRES_TOOLCHAIN_VALIDATION');
      expect(result.diagnostics.some(d=>d.code==='C_INCLUDE_CONDITIONAL_UNRESOLVED'&&d.severity==='warning')).toBe(true);
    }
  });
  it('caps lexical token allocation and explains incomplete scanning',()=>{
    const result=analyzeProject({language:'c',files:[file('main.c',';'.repeat(200000))]});
    expect(result.diagnostics.some(d=>d.code==='TOKEN_SCAN_LIMIT')).toBe(true);
    expect(result.status).toBe('REQUIRES_TOOLCHAIN_VALIDATION');
  });
  it('leaves quoted system headers to the actual compiler search path',()=>{
    const result=analyzeProject({language:'c',files:[file('main.c','#include "stdio.h"')]});
    expect(result.status).toBe('REQUIRES_TOOLCHAIN_VALIDATION');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'C_INCLUDE_UNRESOLVED',severity:'warning'}));
  });
});
