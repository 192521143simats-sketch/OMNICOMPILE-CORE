import {execute} from './executor.js';
import {workPayloadSchema} from '@omnicompile/contracts';
import {installParentDisconnectGuard} from '@omnicompile/orchestration';
const releaseParentGuard=installParentDisconnectGuard();

process.once('message',async(message:any)=>{
  try{
    const payload=workPayloadSchema.parse(message?.payload);process.send?.({type:'started'});
    const completed=await execute(payload);process.send?.({type:'completed',...completed},()=>{releaseParentGuard();process.disconnect();});
  }catch(cause){
    const error=cause as {message?:string;diagnostics?:unknown};
    process.send?.({type:'failed',message:error.message??'Native execution failed',diagnostics:error.diagnostics},()=>{releaseParentGuard();process.disconnect();});
  }
});
