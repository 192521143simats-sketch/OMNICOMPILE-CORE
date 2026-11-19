import { z } from "zod";
import {sha256TaskSchema,primeCountTaskSchema,sha256ChainTaskSchema,matrixMultiplyTaskSchema,portableBenchmarkTaskSchema} from "./portable-catalogue.js";
export * from "./portable-catalogue.js";
import {contributionPolicySchema} from "./network-policy.js";
export * from "./network-policy.js";

export const PROTOCOL_VERSION=2 as const;
const protocolVersion=z.literal(PROTOCOL_VERSION);
export class ProtocolCompatibilityError extends Error {
  readonly code="PROTOCOL_INCOMPATIBLE";
  constructor(){super("Worker protocol is incompatible. Update the worker application and coordinator together.");}
}
function requireProtocol(value:unknown){if(!value||typeof value!=="object"||!("protocolVersion" in value)||value.protocolVersion!==PROTOCOL_VERSION)throw new ProtocolCompatibilityError();}
export function encodeProtocolMessage<T extends object>(message:T){return JSON.stringify({...message,protocolVersion:PROTOCOL_VERSION});}

export const nodeStatuses = ["REGISTERING", "ONLINE", "AVAILABLE", "BUSY", "UNAVAILABLE", "OFFLINE"] as const;
export type NodeStatus = (typeof nodeStatuses)[number];
export const taskStatuses = ["QUEUED", "ASSIGNED", "RUNNING", "COMPLETED", "FAILED", "REQUEUED", "CANCELLED"] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export const capabilitySchema = z.object({
  workerType: z.enum(["NATIVE","BROWSER","ANDROID"]),
  deviceType: z.enum(["DESKTOP","LAPTOP","PHONE","TABLET","SERVER","UNKNOWN"]),
  cpuModel: z.string().min(1).max(300),
  logicalCores: z.number().int().positive().max(1024),
  totalMemoryBytes: z.number().nonnegative(),
  operatingSystem: z.string().min(1).max(200),
  architecture: z.string().min(1).max(50),
  runtimes: z.object({ c: z.boolean(), python: z.boolean(), java: z.boolean() }),
  toolchains: z.object({
    c: z.object({ available: z.boolean(), version: z.string().max(300).optional() }),
    python: z.object({ available: z.boolean(), version: z.string().max(300).optional() }),
    java: z.object({ available: z.boolean(), version: z.string().max(300).optional() })
  }),
  operations: z.object({irOptimization:z.boolean(),staticAnalysis:z.boolean(),browserCompute:z.boolean(),nativeCompilation:z.boolean(),nativeCSource:z.boolean().optional(),taskCancellation:z.boolean().optional(),portableMatrix:z.boolean().optional(),portableBenchmark:z.boolean().optional()}),
  contributionPolicy:contributionPolicySchema.optional()
});
export type CapabilityProfile = z.infer<typeof capabilitySchema>;

export const resourceSchema = z.object({
  cpuUtilizationPercent: z.number().min(0).max(100),
  cpuMeasurementAvailable: z.boolean().optional(),
  freeMemoryBytes: z.number().nonnegative(),
  memoryUtilizationPercent: z.number().min(0).max(100),
  memoryMeasurementAvailable: z.boolean().optional(),
  observedAt: z.string().datetime(),
  batteryPercent:z.number().min(0).max(100).optional(),
  isCharging:z.boolean().optional(),
  networkType:z.enum(["WIFI","ETHERNET","CELLULAR","OFFLINE","UNKNOWN"]).optional(),
  thermalState:z.enum(["NORMAL","MODERATE","SEVERE","CRITICAL","UNKNOWN"]).optional(),
  lifecycleState:z.enum(["FOREGROUND","BACKGROUND","PAUSED","UNKNOWN"]).optional()
});
export type ResourceSnapshot = z.infer<typeof resourceSchema>;

export const registerMessageSchema = z.object({
  protocolVersion,
  type: z.literal("register"),
  profile: capabilitySchema
});
export const heartbeatMessageSchema = z.object({
  protocolVersion,
  type: z.literal("heartbeat"),
  resources: resourceSchema
});
export const taskStateMessageSchema = z.object({
  protocolVersion,
  type: z.literal("task_state"),
  taskId: z.string().min(1).max(64),
  attempt: z.number().int().positive(),
  status: z.enum(["RUNNING", "FAILED"]),
  error: z.string().max(2000).optional(),
  diagnostics:z.array(z.object({severity:z.enum(["error","warning"]),message:z.string().max(2000),line:z.number().int().positive().nullable().optional(),column:z.number().int().positive().nullable().optional()})).max(100).optional()
});
export const taskResultMessageSchema = z.object({
  protocolVersion,
  type: z.literal("task_result"),
  taskId: z.string().min(1).max(64),
  attempt: z.number().int().positive(),
  result: z.unknown(),
  executionTimeMs: z.number().nonnegative(),
  resources: resourceSchema
});
export const disconnectMessageSchema = z.object({ protocolVersion,type: z.literal("disconnect") });
export const workerMessageSchema = z.discriminatedUnion("type", [
  registerMessageSchema,
  heartbeatMessageSchema,
  taskStateMessageSchema,
  taskResultMessageSchema,
  disconnectMessageSchema
]);

export const testTaskSchema = z.discriminatedUnion("operation", [
  sha256TaskSchema,primeCountTaskSchema,sha256ChainTaskSchema,matrixMultiplyTaskSchema,portableBenchmarkTaskSchema
]);
export type TestTaskPayload = z.infer<typeof testTaskSchema>;

const irValue=z.string().min(1).max(200);
const irInstructionSchema=z.discriminatedUnion("op",[
  z.object({op:z.literal("const"),dest:irValue,value:z.number()}),z.object({op:z.literal("copy"),dest:irValue,source:irValue}),
  z.object({op:z.literal("unary"),dest:irValue,operator:z.enum(["+","-","!"]),operand:irValue}),z.object({op:z.literal("binary"),dest:irValue,operator:z.enum(["+","-","*","/","%","==","!=","<","<=",">",">=","&&","||"]),left:irValue,right:irValue}),
  z.object({op:z.literal("call"),dest:irValue.nullable(),callee:z.string().min(1).max(200),arguments:z.array(irValue).max(128)}),z.object({op:z.literal("label"),name:irValue}),
  z.object({op:z.literal("branch"),condition:irValue,thenLabel:irValue,elseLabel:irValue}),z.object({op:z.literal("jump"),target:irValue}),z.object({op:z.literal("return"),value:irValue.nullable()})
]);
export const cIrFunctionSchema=z.object({name:z.string().min(1).max(200),returnType:z.enum(["int","void"]),parameters:z.array(z.object({name:z.string().max(200),type:z.enum(["int","void"]),value:irValue})).max(128),instructions:z.array(irInstructionSchema).max(100_000)});
export const cOptimizationTaskSchema=z.object({operation:z.literal("c_optimize_ir"),function:cIrFunctionSchema});
const sourceName=z.string().min(1).max(255).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
export const cCompileTaskSchema=z.object({operation:z.literal("c_compile"),source:z.string().min(1).max(1_000_000),sourceName:sourceName.optional()});
export const pythonCompileTaskSchema=z.object({operation:z.literal("python_compile"),source:z.string().min(1).max(1_000_000),sourceName:sourceName.optional()});
export const javaCompileTaskSchema=z.object({operation:z.literal("java_compile"),source:z.string().min(1).max(1_000_000),sourceName:sourceName.optional()});
export const workPayloadSchema=z.union([testTaskSchema,cOptimizationTaskSchema,cCompileTaskSchema,pythonCompileTaskSchema,javaCompileTaskSchema]);
export type WorkPayload=z.infer<typeof workPayloadSchema>;

export const coordinatorMessageSchema=z.discriminatedUnion("type",[
  z.object({protocolVersion,type:z.literal("task_cancel"),taskId:z.string().min(1).max(64),attempt:z.number().int().positive()}),
  z.object({protocolVersion,type:z.literal("registered"),nodeId:z.string().min(1).max(64),heartbeatIntervalMs:z.number().int().min(1000).max(60_000)}),
  z.object({protocolVersion,type:z.literal("task_assignment"),taskId:z.string().min(1).max(64),attempt:z.number().int().positive(),taskKind:z.enum(["TEST_COMPUTE","C_OPTIMIZE_IR","C_COMPILE","PYTHON_COMPILE","JAVA_COMPILE"]),payload:workPayloadSchema}),
  z.object({protocolVersion,type:z.literal("error"),code:z.string().min(1).max(100),message:z.string().max(2000)})
]).superRefine((message,context)=>{
  if(message.type!=="task_assignment")return;
  const operations={TEST_COMPUTE:["sha256","prime_count","sha256_chain","matrix_multiply","portable_benchmark"],C_OPTIMIZE_IR:["c_optimize_ir"],C_COMPILE:["c_compile"],PYTHON_COMPILE:["python_compile"],JAVA_COMPILE:["java_compile"]};
  if(!operations[message.taskKind].includes(message.payload.operation))context.addIssue({code:"custom",path:["payload","operation"],message:"Task kind and authorized operation do not match"});
});
export type CoordinatorMessage=z.infer<typeof coordinatorMessageSchema>;
export function parseCoordinatorMessage(value:unknown){requireProtocol(value);return coordinatorMessageSchema.parse(value);}

export function parseWorkerMessage(value: unknown) {
  requireProtocol(value);
  return workerMessageSchema.parse(value);
}
