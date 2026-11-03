import {NativeWorkerSession} from './session.js';
function argument(name:string){const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:undefined;}
const coordinator=argument('--coordinator')??process.env.COORDINATOR_URL,credential=argument('--credential')??process.env.WORKER_CREDENTIAL;
if(!coordinator||!credential){console.error('Usage: omnicompile-worker --coordinator http://host:4100 --credential <scoped-worker-credential>');process.exit(2);}
let previous='';let exiting=false;
const session=new NativeWorkerSession({coordinator,credential,onState:state=>{const signature=`${state.status}:${state.nodeId}:${state.currentTask}:${state.submitted}:${state.failed}`;if(signature!==previous){previous=signature;console.log(`Worker ${state.status} ${state.nodeId} submitted=${state.submitted} failed=${state.failed}`);}if(state.status==='REVOKED'&&!exiting){exiting=true;void session.stop().then(()=>process.exit(2));}}});
session.start();
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{exiting=true;void session.stop().then(()=>process.exit(0));});
