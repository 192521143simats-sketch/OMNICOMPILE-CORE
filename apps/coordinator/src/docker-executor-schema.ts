import {z} from 'zod';
import {cIrFunctionSchema,workPayloadSchema} from '@omnicompile/contracts';

export const compilerFilename=z.string().min(1).max(255).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const language=z.enum(['c','python','java']);
const source=z.object({language,sourceName:compilerFilename,sourceText:z.string().min(1).max(1_000_000)}).strict();
export const compilerPayloadSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('verify'),source,worker:z.record(z.string(),z.unknown())}).strict(),
  z.object({action:z.literal('c_ir'),source:z.string().min(1).max(1_000_000),sourceName:compilerFilename,base:compilerFilename,ir:z.object({kind:z.literal('OmniCompileCIR'),version:z.literal(1),functions:z.array(cIrFunctionSchema).max(1000)})}).strict()
]);
export const programExecutionSchema=z.object({
  language,sourceName:compilerFilename,generatedSource:z.string().max(1_000_000),input:z.string().max(16384).default(''),
  artifactName:compilerFilename.optional(),artifactBase64:z.string().max(11_000_000).optional()
}).strict();
export const dockerJobSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('verify'),language,payload:compilerPayloadSchema.refine(value=>value.action==='verify')}).strict(),
  z.object({kind:z.literal('c_ir'),language:z.literal('c'),payload:compilerPayloadSchema.refine(value=>value.action==='c_ir')}).strict(),
  z.object({kind:z.literal('task'),language,payload:workPayloadSchema.refine(value=>['c_compile','python_compile','java_compile'].includes(value.operation))}).strict(),
  z.object({kind:z.literal('execute'),language,payload:programExecutionSchema}).strict()
]).superRefine((job,context)=>{
  const requested=job.kind==='task'?job.payload.operation.replace('_compile',''):job.kind==='c_ir'?'c':job.kind==='execute'?job.payload.language:job.payload.action==='verify'?job.payload.source.language:'';
  if(requested!==job.language)context.addIssue({code:'custom',message:'Job language does not match its payload.'});
});
export type DockerJob=z.infer<typeof dockerJobSchema>;
