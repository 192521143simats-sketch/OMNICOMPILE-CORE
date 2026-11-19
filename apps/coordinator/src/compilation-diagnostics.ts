import type {ReportDiagnostic} from './build-report.js';

/** Preserve compiler positions in the immediately available persisted failure text. */
export function formatCompilationFailure(diagnostics:ReportDiagnostic[]):string{
  return diagnostics.map(item=>{
    const located=Number.isInteger(item.line)&&Number(item.line)>0;
    if(!located)return /^(?:Source location unavailable:|Line [1-9]\d*(?:, column [1-9]\d*)?:)/i.test(item.message)
      ? item.message:`Source location unavailable: ${item.message}`;
    const column=Number.isInteger(item.column)&&Number(item.column)>0?`, column ${item.column}`:'';
    const prefix=new RegExp(`^Line\\s+${item.line}(?:,?\\s+column\\s+\\d+)?\\s*:\\s*`,'i');
    return `Line ${item.line}${column}: ${item.message.replace(prefix,'')}`;
  }).join('\n').slice(0,2000);
}
