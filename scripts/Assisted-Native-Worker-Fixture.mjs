import {NativeWorkerSession} from '../apps/worker/src/session.ts';
import {profile,resources} from '../apps/worker/src/profiler.ts';
import {assertIsolatedTarget,verifyIsolatedCoordinator} from './Integration-Target.mjs';
const target=assertIsolatedTarget();await verifyIsolatedCoordinator(target);
if(process.env.COORDINATOR_URL!==target.base)throw new Error('Native assistance fixture must target the owned isolated coordinator');
const credential=process.env.WORKER_CREDENTIAL;if(!credential)throw new Error('Isolated credential required');
const session=new NativeWorkerSession({coordinator:target.base,credential,resources,profile:async()=>{
 const detected=await profile();return {...detected,cpuModel:'Native assistance test fixture: local compiler capabilities deliberately disabled',runtimes:{c:false,python:false,java:false},toolchains:{c:{available:false},python:{available:false},java:{available:false}},operations:{...detected.operations,nativeCompilation:false,nativeCSource:false}};
},onState:()=>{}});
session.start();
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void session.stop().finally(()=>process.exit());});
