import {fork,execFile} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';

const execFileAsync=promisify(execFile);
export class TaskTerminationUnconfirmedError extends Error {constructor(){super('Native process-tree termination could not be confirmed. Worker stopped; inspect owned processes before restarting.');this.name='TaskTerminationUnconfirmedError';}}
export async function runOwnedProcess<T>(entry:URL,payload:unknown,options:{signal?:AbortSignal;onStarted?:()=>void}={}):Promise<{result:T;executionTimeMs:number}>{
  options.signal?.throwIfAborted();
  const workspace=await mkdtemp(join(tmpdir(),'omnicompile-owned-task-'));
  // Compiler children inherit only toolchain/system settings, never enrollment,
  // coordinator, database, admin or session credentials.
  const env:NodeJS.ProcessEnv={TMP:workspace,TEMP:workspace,TMPDIR:workspace};
  const allowed=new Set(['path','pathext','systemroot','windir','comspec','gcc_executable','python_executable','java_home','omnicompile_jdk_home','lang','lc_all']);
  for(const [key,value] of Object.entries(process.env))if(allowed.has(key.toLowerCase()))env[key]=value;
  try{
    options.signal?.throwIfAborted();
    const source=entry.pathname.endsWith('.ts');
    const sandbox=process.env.OMNICOMPILE_COMPILER_SANDBOX_EXECUTABLE;
    if(sandbox&&process.platform!=='linux')throw new Error('Configured compiler filesystem sandbox requires Linux');
    const nodeArguments=source?['--import','tsx']:process.execArgv;
    const child=fork(entry,[],{env,windowsHide:true,detached:process.platform!=='win32',...(sandbox?{execPath:sandbox}:{}),execArgv:sandbox?[process.execPath,...nodeArguments]:nodeArguments,stdio:['ignore','ignore','ignore','ipc']});
    return await new Promise((resolve,reject)=>{
      let result:{result:T;executionTimeMs:number}|undefined,failure:Error|undefined,aborted=false,killing:Promise<void>|undefined;
      const abortError=()=>new DOMException('Task execution cancelled','AbortError');
      const terminate=()=>{
        if(killing)return killing;
        killing=(async()=>{
          if(!child.pid||child.exitCode!==null||child.signalCode!==null)return;
          try{
            if(process.platform==='win32'){
              const systemRoot=process.env.SystemRoot??process.env.SYSTEMROOT;
              if(!systemRoot)throw new Error('Windows system directory unavailable');
              await execFileAsync(join(systemRoot,'System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,timeout:5000});
            }else process.kill(-child.pid,'SIGKILL');
          }catch{
            // Parent-only termination is NOT evidence that compiler descendants
            // stopped. Fail closed so the agent cannot reconnect as AVAILABLE.
            failure=new TaskTerminationUnconfirmedError();child.kill('SIGKILL');
          }
        })();return killing;
      };
      const cancel=()=>{aborted=true;void terminate();};
      const timeout=setTimeout(()=>{failure=new Error('Native task exceeded its 120-second safety bound');void terminate();},120000);
      options.signal?.addEventListener('abort',cancel,{once:true});if(options.signal?.aborted)cancel();
      child.on('message',(message:any)=>{
        if(message?.type==='started'){if(!aborted)options.onStarted?.();}
        else if(message?.type==='completed')result={result:message.result,executionTimeMs:message.executionTimeMs};
        else if(message?.type==='failed'){failure=Object.assign(new Error(message.message),{diagnostics:message.diagnostics});}
      });
      child.once('error',error=>{failure=error;});
      child.once('close',async code=>{
        clearTimeout(timeout);options.signal?.removeEventListener('abort',cancel);await killing;
        if(failure instanceof TaskTerminationUnconfirmedError)reject(failure);else if(aborted)reject(abortError());else if(failure)reject(failure);else if(result)resolve(result);
        else if(sandbox&&code===126)reject(new Error('The compiler filesystem sandbox could not initialize. Check runtime support and the sandbox configuration.'));
        else reject(new Error('Native task process exited without a result'));
      });
      child.send({payload},error=>{if(error){failure=error;void terminate();}});
    });
  }finally{
    // Only the newly created per-task workspace is removed; no user path.
    await rm(workspace,{recursive:true,force:true,maxRetries:3,retryDelay:100}).catch(()=>{throw new TaskTerminationUnconfirmedError();});
  }
}
