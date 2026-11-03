import {encodeProtocolMessage,parseCoordinatorMessage,portableWorkloadCatalogue,type CapabilityProfile,type ResourceSnapshot} from "@omnicompile/contracts";
export type BrowserState={status:string;nodeId:string;error:string;taskId?:string|undefined;progress?:number|undefined};
type Options={url:string;profile:()=>CapabilityProfile;resources:()=>ResourceSnapshot;onChange:(state:BrowserState)=>void;socket:(url:string)=>WebSocket;worker:()=>Worker};
export class BrowserSession{
  private state:BrowserState={status:"CONNECTING",nodeId:"",error:""};
  private ws:WebSocket|undefined;
  private task:{taskId:string;attempt:number;worker:Worker;timer:ReturnType<typeof setTimeout>}|undefined;
  private retry:ReturnType<typeof setTimeout>|undefined;
  private registration?:ReturnType<typeof setTimeout>;
  private heartbeat?:ReturnType<typeof setInterval>;
  private active=false;private paused=false;private hidden=false;private connected=true;private rejected=false;private failures=0;
  constructor(private readonly options:Options){}
  start(){this.active=true;this.connect();}
  pause(){this.paused=true;this.withdraw();this.update({status:"PAUSED",error:""});}
  resume(){this.paused=false;this.rejected=false;this.connect();}
  visibility(hidden:boolean){this.hidden=hidden;if(hidden){this.withdraw();this.update({status:this.paused?"PAUSED":"BACKGROUND"});}else this.connect();}
  online(online:boolean){this.connected=online;if(!online){this.withdraw();this.update({status:this.paused?"PAUSED":"DISCONNECTED",error:"Device is offline. Contribution will resume when connected."});}else this.connect();}
  stop(){this.active=false;this.withdraw();}
  private update(patch:Partial<BrowserState>){this.state={...this.state,...patch};this.options.onChange({...this.state});}
  private canConnect(){return this.active&&!this.paused&&!this.hidden&&this.connected&&!this.rejected;}
  private send(message:object){if(this.ws?.readyState===1)this.ws.send(encodeProtocolMessage(message));}
  private stopTask(){if(this.task){clearTimeout(this.task.timer);this.task.worker.terminate();this.task=undefined;}this.update({taskId:undefined,progress:undefined});}
  private withdraw(){clearTimeout(this.retry);clearTimeout(this.registration);clearInterval(this.heartbeat);this.retry=undefined;this.stopTask();const ws=this.ws;this.ws=undefined;if(ws){ws.onclose=null;ws.onerror=null;ws.onmessage=null;ws.onopen=null;try{if(ws.readyState===1)ws.send(encodeProtocolMessage({type:"disconnect"}));ws.close();}catch{/* Socket may already be closed by the browser. */}}}
  private reconnect(){this.withdraw();if(!this.canConnect())return;this.update({status:this.state.status==="PENDING_APPROVAL"?"PENDING_APPROVAL":"DISCONNECTED"});const delay=Math.min(30000,1000*2**Math.min(this.failures++,5))*(.8+Math.random()*.2);this.retry=setTimeout(()=>{this.retry=undefined;this.connect();},delay);}
  private connect(){
    if(!this.canConnect()||this.ws)return;clearTimeout(this.retry);this.update({status:"CONNECTING",error:""});
    let ws:WebSocket;try{ws=this.options.socket(this.options.url);}catch{this.update({error:"Unable to establish a worker connection."});this.reconnect();return;}this.ws=ws;
    this.registration=setTimeout(()=>{if(this.ws===ws){this.update({error:"Coordinator registration timed out. Retrying…"});this.reconnect();}},10000);
    ws.onopen=()=>{if(this.ws===ws)this.send({type:"register",profile:this.options.profile()});};
    ws.onmessage=event=>{
      if(this.ws!==ws)return;let message;try{message=parseCoordinatorMessage(JSON.parse(event.data));}catch{this.rejected=true;this.withdraw();this.update({status:"ERROR",error:"Coordinator protocol is incompatible. Reload the updated application."});return;}
      if(message.type==="registered"){
        clearTimeout(this.registration);this.failures=0;this.update({nodeId:message.nodeId,status:"AVAILABLE",error:""});
        this.send({type:"heartbeat",resources:this.options.resources()});clearInterval(this.heartbeat);
        this.heartbeat=setInterval(()=>this.send({type:"heartbeat",resources:this.options.resources()}),message.heartbeatIntervalMs);
      }else if(message.type==="task_cancel"){
        if(this.task?.taskId===message.taskId&&this.task.attempt===message.attempt){this.stopTask();this.update({status:"AVAILABLE"});}
      }else if(message.type==="error")this.update({error:message.message,...(message.code==="WORKER_APPROVAL_PENDING"?{status:"PENDING_APPROVAL"}:{})});
      else if(message.type==="task_assignment"){
        if(this.task){if(this.task.taskId!==message.taskId||this.task.attempt!==message.attempt)this.send({type:"task_state",taskId:message.taskId,attempt:message.attempt,status:"FAILED",error:"Browser worker already has an active attempt."});return;}
        if(!this.canConnect()||message.payload.operation.endsWith("_compile")){this.send({type:"task_state",taskId:message.taskId,attempt:message.attempt,status:"FAILED",error:"This task requires a native toolchain or unavailable browser contribution."});return;}
        let worker:Worker;try{worker=this.options.worker();}catch{this.send({type:"task_state",taskId:message.taskId,attempt:message.attempt,status:"FAILED",error:"This browser could not start a sandboxed Web Worker."});return;}
        const operation=message.payload.operation,limit=operation in portableWorkloadCatalogue?portableWorkloadCatalogue[operation as keyof typeof portableWorkloadCatalogue].executionLimit.maxDurationMs:30000;
        const task={taskId:message.taskId,attempt:message.attempt,worker,timer:setTimeout(()=>finish("Browser execution time limit exceeded."),limit)};this.task=task;
        const finish=(error?:string,result?:unknown,executionTimeMs?:number)=>{if(this.task!==task||this.ws!==ws)return;if(error)this.send({type:"task_state",taskId:task.taskId,attempt:task.attempt,status:"FAILED",error:error.slice(0,2000)});else this.send({type:"task_result",taskId:task.taskId,attempt:task.attempt,result,executionTimeMs,resources:this.options.resources()});this.stopTask();this.update({status:"AVAILABLE"});};
        worker.onmessage=event=>{const value=event.data;if(this.task!==task||value?.taskId!==task.taskId||value?.attempt!==task.attempt)return;
          if(value.type==="progress"){if(Number.isFinite(value.percent))this.update({progress:Math.max(0,Math.min(100,value.percent))});return;}
          if(value.type==="completed"&&Number.isFinite(value.executionTimeMs)&&value.executionTimeMs>=0)finish(undefined,value.result,value.executionTimeMs);
          else finish("Browser worker could not complete this authorized task.");};
        worker.onerror=event=>{event.preventDefault();finish("Browser worker execution failed.");};worker.onmessageerror=()=>finish("Browser worker returned an invalid message.");
        this.update({status:"BUSY",taskId:task.taskId,progress:0,error:""});this.send({type:"task_state",taskId:task.taskId,attempt:task.attempt,status:"RUNNING"});worker.postMessage(message);
      }
    };
    ws.onclose=event=>{if(this.ws!==ws)return;if(event.code===1008||event.code===1012&&event.reason==="Reconnected elsewhere"){this.rejected=true;this.withdraw();this.update({status:event.code===1008?"ERROR":"DISCONNECTED",error:event.code===1008?"Enrollment is expired or revoked. Join an active network again.":"This enrollment is connected in another tab. Use that tab or explicitly resume here."});}else this.reconnect();};
    ws.onerror=()=>{if(this.ws===ws)this.update({error:"Worker connection interrupted. Waiting for reconnect…"});};
  }
}
