import {createServer, type Server} from "node:http";
import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {api} from "./api.js";

let server:Server;
let base:string;
beforeAll(async()=>{
  server=createServer((request,response)=>{
    if(request.url==="/ok"){response.setHeader("content-type","application/json");response.end('{"items":[]}');}
    else if(request.url==="/denied"){response.writeHead(403,{"content-type":"application/json"});response.end('{"error":{"code":"FORBIDDEN","message":"Administrator access required."}}');}
    else if(request.url==="/invalid"){response.writeHead(200,{"content-type":"application/json"});response.end("{broken internal payload");}
    else{response.writeHead(503,{"content-type":"text/html"});response.end("<pre>private database connection details</pre>");}
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();if(!address||typeof address==="string")throw new Error("Missing fixture port");
  base=`http://127.0.0.1:${address.port}`;
});
afterAll(async()=>{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));});
describe("web API failure handling",()=>{
  it("preserves real successful server data",async()=>{expect(await api(base+"/ok")).toEqual({items:[]});});
  it("preserves authorized safe application error messages",async()=>{await expect(api(base+"/denied")).rejects.toThrow("Administrator access required.");});
  it("explains an unavailable service without exposing its HTML response",async()=>{
    await expect(api(base+"/offline")).rejects.toThrow("The service is temporarily unavailable. Try again shortly.");
  });
  it("does not expose malformed response internals to users",async()=>{
    await expect(api(base+"/invalid")).rejects.toThrow("The service returned an invalid response. Please try again.");
  });
});

// Exercise connected behavior independently of the public frontend offline default.
vi.mock('./backend-config.js',()=>({backendConfig:{mode:'remote',apiBaseUrl:null,wsBaseUrl:null},isBackendAvailable:()=>true}));
