import type {FastifyInstance} from "fastify";

export function installRuntimeGuards(app:FastifyInstance,allowedOrigin:(origin:string|undefined)=>boolean,probeDatabase:()=>Promise<void>,testInstance?:string) {
  app.addHook("onRequest",async(request,reply)=>{
    const mutation=["POST","PUT","PATCH","DELETE"].includes(request.method);
    const upgrade=request.headers.upgrade?.toLowerCase()==="websocket";
    // Native bearer clients have no browser Origin; cookie clients must have it.
    if ((mutation||upgrade) && (!allowedOrigin(request.headers.origin) || (Boolean(request.headers.cookie)&&request.headers.origin===undefined))) {
      return reply.code(403).send({error:{code:"ORIGIN_REJECTED",message:"The request origin is not allowed."}});
    }
  });
  // Liveness must not restart a healthy process during a recoverable database outage.
  app.get("/live",async()=>({status:"alive",service:"omnicompile-coordinator"}));
  app.get("/health",async(_request,reply)=>{
    try {await probeDatabase();return {status:"ok",service:"omnicompile-coordinator",database:"mysql",time:new Date().toISOString()};}
    catch {return reply.code(503).send({status:"unavailable",error:{code:"DATABASE_UNAVAILABLE",message:"The coordinator database is unavailable."}});}
  });
  app.get("/ready",async(_request,reply)=>{
    try {await probeDatabase();return {status:"ready",service:"omnicompile-coordinator",database:"mysql",time:new Date().toISOString(),...(testInstance?{testInstance}:{})};}
    catch {return reply.code(503).send({status:"unavailable",error:{code:"DATABASE_UNAVAILABLE",message:"The coordinator is not ready. Try again shortly."}});}
  });
}
