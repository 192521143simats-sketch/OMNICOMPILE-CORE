import Fastify from "fastify";
import {describe,expect,it} from "vitest";
import {installRuntimeGuards} from "./runtime-http.js";
import {createOriginPolicy} from "./runtime-policy.js";

describe("HTTP runtime boundaries",()=>{
  async function server(probe:()=>Promise<void>=async()=>{}) {
    const app=Fastify({trustProxy:false});
    installRuntimeGuards(app,createOriginPolicy("https://grid.example.com","production"),probe);
    app.post("/protected",async request=>({ip:request.ip}));
    app.get("/ws/worker",async()=>({accepted:true}));
    return app;
  }
  it("rejects untrusted cookie mutations and WebSocket handshakes before handlers",async()=>{
    const app=await server();try {
      for(const url of ["/protected","/ws/worker"]) {
        const method=url.startsWith('/ws')?'GET':'POST';
        const upgrade=url.startsWith('/ws')?{upgrade:'websocket'}:{};
        for(const origin of [undefined,"http://192.168.1.2:5173","https://evil.example"]) {
          const response=await app.inject({method,url,headers:{cookie:'omnicompile_worker=private',...upgrade,...(origin?{origin}:{})}});
          expect(response.statusCode).toBe(403);
          expect(response.json().error.code).toBe('ORIGIN_REJECTED');
        }
      }
      expect((await app.inject({method:'POST',url:'/protected',headers:{cookie:'omnicompile_session=private',origin:'https://grid.example.com'}})).statusCode).toBe(200);
      expect((await app.inject({url:'/ws/worker',headers:{upgrade:'websocket',authorization:'Bearer native'}})).statusCode).toBe(200);
    } finally {await app.close();}
  });
  it("cannot spoof the rate-limit identity through an untrusted forwarded header",async()=>{
    const app=await server();try {const result=await app.inject({method:'POST',url:'/protected',headers:{'x-forwarded-for':'198.51.100.1'},remoteAddress:'127.0.0.2'});expect(result.json().ip).toBe('127.0.0.2');}finally{await app.close();}
  });
  it("reports unavailable readiness without leaking database errors, then recovers",async()=>{
    let available=false;
    const app=await server(async()=>{if(!available)throw new Error('password=private SELECT internal_schema');});
    try {
      const failed=await app.inject('/ready');expect(failed.statusCode).toBe(503);expect(failed.body).not.toMatch(/private|SELECT|internal_schema/);
      expect((await app.inject('/health')).statusCode).toBe(503);
      available=true;const ready=await app.inject('/ready');expect(ready.statusCode).toBe(200);expect(ready.json().database).toBe('mysql');expect((await app.inject('/health')).statusCode).toBe(200);
    }finally{await app.close();}
  });
  it("keeps process liveness independent of database availability",async()=>{
    let probes=0;
    const app=await server(async()=>{probes++;throw new Error('database unavailable');});
    try {
      const live=await app.inject('/live');
      expect(live.statusCode).toBe(200);expect(live.json().status).toBe('alive');expect(probes).toBe(0);
      expect((await app.inject('/ready')).statusCode).toBe(503);expect(probes).toBe(1);
      expect((await app.inject('/live')).statusCode).toBe(200);expect(probes).toBe(1);
    }finally{await app.close();}
  });
});
