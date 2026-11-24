/** Device-authenticated access to an already assigned tool task; never sends source or shell commands. */
export async function requestCompilerAssistance(options:{origin:string;taskId:string;attempt:number;credential?:string;signal:AbortSignal}){
 const origin=new URL(options.origin);origin.protocol=origin.protocol==='wss:'?'https:':origin.protocol==='ws:'?'http:':origin.protocol;
 if(!['https:','http:'].includes(origin.protocol)||origin.username||origin.password)throw new Error('Invalid compiler tool origin');
 const response=await fetch(new URL('/api/worker/compiler',origin),{method:'POST',credentials:'include',redirect:'error',signal:options.signal,headers:{'content-type':'application/json','ngrok-skip-browser-warning':'1',...(options.credential?{authorization:`Bearer ${options.credential}`}:{})},body:JSON.stringify({taskId:options.taskId,attempt:options.attempt})});
 if(Number(response.headers.get('content-length'))>32_000_000)throw new Error('Compiler tool response exceeded the transfer limit');
 const reader=response.body?.getReader();if(!reader)throw new Error('Compiler tool returned an empty response');
 const chunks:Uint8Array[]=[];let length=0;
 for(;;){const item=await reader.read();if(item.done)break;length+=item.value.byteLength;if(length>32_000_000){await reader.cancel();throw new Error('Compiler tool response exceeded the transfer limit');}chunks.push(item.value);}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 const data=JSON.parse(new TextDecoder().decode(bytes));
 if(!response.ok)throw Object.assign(new Error(data.error?.message??'Server compiler tool unavailable'),{diagnostics:data.error?.diagnostics});
 if(!data.result||!Number.isFinite(data.executionTimeMs)||data.executionTimeMs<0||data.assistance?.method!=='server-assisted compilation')throw new Error('Compiler tool response is invalid');
 return {result:data.result as unknown,executionTimeMs:Number(data.executionTimeMs)};
}
