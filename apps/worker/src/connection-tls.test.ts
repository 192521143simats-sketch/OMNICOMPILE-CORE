import {expect,it} from 'vitest';
import {createServer} from 'node:https';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import * as tls from 'node:tls';
import {WebSocketServer} from 'ws';
import {NativeWorkerSession} from './session.js';

it.skipIf(typeof tls.setDefaultCACertificates!=='function')('registers and reconnects through authenticated HTTPS discovery on a different TLS backend',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'omnicompile-transport-'));
  const trust=tls.getCACertificates('default');
  let session:NativeWorkerSession|undefined;
  const key=join(directory,'key.pem'),cert=join(directory,'cert.pem');
  execFileSync(process.platform==='win32'?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl',[
    'req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'
  ],{stdio:'ignore',windowsHide:true,timeout:10000});
  const options={key:await readFile(key),cert:await readFile(cert)};
  const backend=createServer(options),sockets=new WebSocketServer({server:backend,path:'/ws/worker'});
  const credential='isolated-native-transport-credential';let registrations=0,discoveries=0;
  sockets.on('connection',(socket,request)=>{
    expect(request.headers.authorization).toBe(`Bearer ${credential}`);
    socket.on('message',raw=>{const message=JSON.parse(raw.toString());if(message.type==='register'){
      registrations++;socket.send(JSON.stringify({protocolVersion:2,type:'registered',nodeId:'NODE-A001',heartbeatIntervalMs:1000}));
      if(registrations===1)setTimeout(()=>socket.terminate(),100);
    }});
  });
  const listen=(server:ReturnType<typeof createServer>)=>new Promise<number>(resolve=>server.listen(0,'127.0.0.1',()=>resolve((server.address() as {port:number}).port)));
  const port=await listen(backend);
  const frontend=createServer(options,(request,response)=>{
    expect(request.url).toBe('/api/worker/connection');expect(request.headers.authorization).toBe(`Bearer ${credential}`);discoveries++;
    response.setHeader('Content-Type','application/json');response.end(JSON.stringify({websocketUrl:`wss://127.0.0.1:${port}/ws/worker`}));
  });
  try{
    tls.setDefaultCACertificates([...trust,options.cert.toString()]);
    const origin=`https://127.0.0.1:${await listen(frontend)}`;
    session=new NativeWorkerSession({coordinator:origin,credential,profile:async()=>({workerType:'NATIVE',deviceType:'DESKTOP',cpuModel:'TLS fixture',logicalCores:1,totalMemoryBytes:1024**3,operatingSystem:'Test',architecture:'x64',runtimes:{c:false,python:false,java:false},toolchains:{c:{available:false},python:{available:false},java:{available:false}},operations:{irOptimization:false,staticAnalysis:false,browserCompute:true,nativeCompilation:false}}),resources:()=>({cpuUtilizationPercent:0,freeMemoryBytes:1024**3,memoryUtilizationPercent:0,observedAt:new Date().toISOString()}),onState:()=>{}});
    session.start();await expect.poll(()=>registrations,{timeout:10000}).toBe(2);
    expect(discoveries).toBe(2);expect(session.snapshot().nodeId).toBe('NODE-A001');expect(session.snapshot().status).toBe('AVAILABLE');
  }finally{
    await session?.stop();sockets.clients.forEach(socket=>socket.terminate());sockets.close();
    frontend.closeAllConnections();backend.closeAllConnections();await Promise.all([new Promise(resolve=>frontend.close(resolve)),new Promise(resolve=>backend.close(resolve))]);
    tls.setDefaultCACertificates(trust);await rm(directory,{recursive:true,force:true});
  }
},20000);
