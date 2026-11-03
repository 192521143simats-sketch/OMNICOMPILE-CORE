import {verifyCompilation} from './compilation-verification.js';
import {compileCSource,compileCExecutable} from '@omnicompile/compiler-c';
import {installParentDisconnectGuard} from '@omnicompile/orchestration';
const releaseParentGuard=installParentDisconnectGuard();
process.once('message',async(message:any)=>{
  const started=performance.now();
  process.send?.({type:'started'});
  try{
    const payload=message.payload;
    let result:unknown;
    if(payload.action==='verify')result=await verifyCompilation(payload.source,payload.worker);
    else if(payload.action==='c_ir'){
      const validation=await compileCSource(payload.source,payload.sourceName);
      const artifact=await compileCExecutable(payload.ir,payload.base);
      const {bytes,...metadata}=artifact;
      result={diagnostics:validation.diagnostics,artifact:{...metadata,artifactBase64:bytes.toString('base64')}};
    }else throw new Error('Unknown coordinator compiler operation');
    process.send?.({type:'completed',result,executionTimeMs:performance.now()-started},()=>{releaseParentGuard();process.disconnect();});
  }catch(error){
    const failure=error as Error & {diagnostics?:unknown};
    process.send?.({type:'failed',message:failure.message,diagnostics:failure.diagnostics},()=>{releaseParentGuard();process.disconnect();});
  }
});
