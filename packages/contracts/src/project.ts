import {z} from 'zod';

export const projectMaxFiles=32;
export const projectMaxSourceBytes=1_000_000;
const pathSchema=z.string().min(1).max(255).regex(/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/)
  .refine(path=>path.split('/').every(segment=>segment!=='.'&&segment!=='..'&&!segment.endsWith('.')&&
    !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(segment)),'Paths must be portable relative file paths without reserved device names.');
export const projectInputSchema=z.object({
  language:z.enum(['c','python','java']),
  files:z.array(z.object({path:pathSchema,content:z.string().max(projectMaxSourceBytes)}).strict()).min(1).max(projectMaxFiles),
  entryPoint:pathSchema.optional(),
}).strict().superRefine((input,ctx)=>{
  // Zod may continue refinements after size errors; never expand an oversized
  // manifest into a quadratic collision check or unnecessary UTF-8 allocations.
  if(input.files.length>projectMaxFiles||input.files.some(file=>file.content.length>projectMaxSourceBytes))return;
  const issue=(message:string)=>ctx.addIssue({code:'custom',message});
  const paths=new Set<string>();
  let bytes=0;
  const sourceExtension=input.language==='c'?'.c':input.language==='python'?'.py':'.java';
  for(const file of input.files){
    const folded=file.path.toLowerCase();
    if(paths.has(folded))issue('Duplicate paths including case-fold collisions are not portable.');
    paths.add(folded);
    if(!file.path.endsWith(sourceExtension)&&!(input.language==='c'&&file.path.endsWith('.h')))
      issue('File extension does not match the project language.');
    bytes+=new TextEncoder().encode(file.content).length;
  }
  if(bytes>projectMaxSourceBytes)issue('Project exceeds the aggregate UTF-8 source byte limit.');
  for(const path of paths)for(const other of paths)if(other.startsWith(path+'/'))issue('File and directory paths collide.');
  if(!input.files.some(file=>file.path.endsWith(sourceExtension)))issue('At least one source file is required.');
  if(input.entryPoint&&(!input.entryPoint.endsWith(sourceExtension)||!input.files.some(file=>file.path===input.entryPoint)))
    issue('Entry point must name an existing submitted source file.');
});
export type ProjectInput=z.infer<typeof projectInputSchema>;
export type ProjectAnalysis={
  language:ProjectInput['language'];sourceBytes:number;
  files:{path:string;dependencies:string[];externalDependencies:string[]}[];
  /** Deterministic dependency-first strongly connected components of the detected graph, never compilable units. */
  groups:string[][];
  diagnostics:{severity:'warning'|'error';code:string;message:string;path?:string}[];
  status:'REQUIRES_TOOLCHAIN_VALIDATION'|'INVALID';notes:string[];
};
