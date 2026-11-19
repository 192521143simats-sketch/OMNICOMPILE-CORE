import {expect,it} from 'vitest';
import {compileCSource} from '@omnicompile/compiler-c';
import {compilePython} from '@omnicompile/compiler-python';
import {compileJava} from '@omnicompile/compiler-java';
import {formatCompilationFailure} from './compilation-diagnostics.js';
import type {ReportDiagnostic} from './build-report.js';

it.each([
  ['C',()=>compileCSource('int main(void) {\n int x=1;\n return missing;\n}\n','main.c')],
  ['Python',()=>compilePython('def main():\n    x = 1\n    return (\n')],
  ['Java',()=>compileJava('public class Main {\n public static void main(String[] args) {\n  System.out.println(missing);\n }\n}','Main.java')],
] as const)('retains the actual %s compiler failure position in persisted text',async(_language,compile)=>{
  let failure:unknown;
  try{await compile();}catch(error){failure=error;}
  expect(failure).toBeInstanceOf(Error);
  const diagnostics=(failure as {diagnostics:ReportDiagnostic[]}).diagnostics;
  expect(diagnostics).toContainEqual(expect.objectContaining({severity:'error',line:3}));
  const located=diagnostics.find(item=>item.severity==='error'&&item.line===3)!;
  expect(located.column).toBeGreaterThan(0);
  expect(formatCompilationFailure(diagnostics)).toContain(`Line 3, column ${located.column}:`);
},40_000);
