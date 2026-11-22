/** HTTPS coordinator is authoritative for its direct WebSocket transport. */
export async function workerConnectionEndpoint(origin:string,credential:string,request:typeof fetch=fetch,internalCoordinator=false):Promise<string>{
  const base=new URL(origin);
  if(base.protocol==='http:'){
    const local=internalCoordinator&&['omnicompile-coordinator','coordinator'].includes(base.hostname)||base.hostname==='localhost'||base.hostname==='127.0.0.1'||base.hostname==='[::1]'||/^10\./.test(base.hostname)||/^192\.168\./.test(base.hostname)||/^172\.(1[6-9]|2\d|3[01])\./.test(base.hostname);
    if(!local)throw new Error('Insecure public coordinator is not permitted.');
    return new URL('/ws/worker',origin).href.replace(/^http:/,'ws:');
  }
  if(base.protocol!=='https:'||base.username||base.password)throw new Error('Invalid coordinator.');
  const response=await request(new URL('/api/worker/connection',base).href,{headers:{Authorization:`Bearer ${credential}`},redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Worker connection discovery unavailable.');
  const body=await response.json() as {websocketUrl?:unknown};
  if(typeof body.websocketUrl!=='string')throw new Error('Invalid worker transport.');
  const target=new URL(body.websocketUrl);
  if(target.protocol!=='wss:'||target.username||target.password||target.search||target.hash||target.pathname!=='/ws/worker')throw new Error('Unsafe worker transport.');
  return target.href;
}
