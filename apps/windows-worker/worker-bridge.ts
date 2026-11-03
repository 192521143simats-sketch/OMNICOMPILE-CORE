import {NativeWorkerSession} from '../worker/src/session.js';
import {profile} from '../worker/src/profiler.js';
import {validateSettings} from './settings.cjs';
const coordinator=process.env.COORDINATOR_URL,credential=process.env.WORKER_CREDENTIAL;
if(!coordinator||!credential||!process.send)throw new Error('Scoped desktop worker configuration is required.');
const settings=validateSettings(JSON.parse(process.env.OMNICOMPILE_WORKER_SETTINGS??'{}'));
// The desktop applies its CPU hard cap through the Windows Job Object before
// starting this session; host-wide CPU admission would consume retries needlessly.
const session=new NativeWorkerSession({coordinator,credential,policy:{enabled:true,maxMemoryBytes:settings.maxMemoryMB*1024**2,maxTaskDurationMs:settings.maxTaskDurationSeconds*1000},profile:async()=>{const found=await profile();return settings.allowNative?found:{...found,runtimes:{c:false,python:false,java:false},operations:{...found.operations,nativeCompilation:false,nativeCSource:false}};},onState:state=>{if(process.connected)process.send?.({type:'state',state},()=>{});}});
let queue=Promise.resolve();process.on('message',(message:any)=>{queue=queue.then(async()=>{try{if(message?.type==='start')session.start();else if(message?.type==='pause')await session.pause();else if(message?.type==='stop')await session.stop();else throw new Error('Unsupported desktop command.');process.send?.({type:'ack',id:message.id});}catch{process.send?.({type:'ack',id:message.id,error:'Worker control failed; contribution remains stopped.'});}});});
process.on('disconnect',()=>{void session.stop().finally(()=>process.exit(0));});
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{void session.stop().finally(()=>process.exit(0));});
