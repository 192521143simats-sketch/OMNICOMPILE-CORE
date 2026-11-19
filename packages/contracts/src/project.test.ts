import {describe,expect,it} from 'vitest';
import {projectInputSchema} from './project.js';
const file=(path:string,content='')=>({path,content});
describe('bounded portable project manifest',()=>{
  it('accepts empty Python packages and C headers alongside a source',()=>{
    expect(projectInputSchema.parse({language:'python',files:[file('pkg/__init__.py'),file('pkg/main.py')]}).files).toHaveLength(2);
    expect(projectInputSchema.parse({language:'c',files:[file('main.c'),file('empty.h')],entryPoint:'main.c'}).entryPoint).toBe('main.c');
  });
  it.each(['../main.py','/main.py','C:/main.py','a\\main.py','//host/main.py','a/../main.py','a/./main.py','é.py','a//main.py','CON.py','nul/main.py','Aux.PY/main.py','PRN/main.py','COM1.py','LPT9/main.py','pkg./main.py'])('rejects unsafe path %s',path=>{
    expect(projectInputSchema.safeParse({language:'python',files:[file(path)]}).success).toBe(false);
  });
  it('rejects duplicate, case-fold and file/directory collisions',()=>{
    for(const paths of [['a.py','a.py'],['A.py','a.py'],['pkg.py','pkg.py/a.py']])
      expect(projectInputSchema.safeParse({language:'python',files:paths.map(path=>file(path))}).success).toBe(false);
  });
  it('bounds file count, UTF-8 bytes, paths and rejects unknown fields',()=>{
    expect(projectInputSchema.safeParse({language:'python',files:[file('a.py','é'.repeat(500000))]}).success).toBe(true);
    for(const value of [
      {language:'python',files:Array.from({length:33},(_,i)=>file(i+'.py'))},
      {language:'python',files:[file('a.py','é'.repeat(500001))]},
      {language:'python',files:[file('a.py','a'.repeat(500000)),file('b.py','b'.repeat(500001))]},
      {language:'python',files:[file('a'.repeat(253)+'.py')]},
      {language:'python',files:[{...file('a.py'),extra:true}]},
      {language:'python',files:[file('a.py')],extra:true},
    ])expect(projectInputSchema.safeParse(value).success).toBe(false);
  });
  it('requires language extensions and an existing source entry point',()=>{
    for(const value of [
      {language:'c',files:[file('only.h')]},
      {language:'java',files:[file('a.py')]},
      {language:'python',files:[file('a.py')],entryPoint:'b.py'},
      {language:'c',files:[file('main.c'),file('a.h')],entryPoint:'a.h'},
    ])expect(projectInputSchema.safeParse(value).success).toBe(false);
  });
});
