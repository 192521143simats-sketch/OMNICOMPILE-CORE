// Test-only loopback TLS termination. Never a deployment server or public proxy.
import {createServer} from 'node:https';
import {request} from 'node:http';
import {readFileSync} from 'node:fs';
const instance=process.env.OMNICOMPILE_TEST_INSTANCE,port=Number(process.env.OMNICOMPILE_TEST_TLS_PORT),upstream=new URL(process.env.OMNICOMPILE_TEST_VITE_BASE);
if(!/^[a-f0-9]{16}$/.test(instance??'')||upstream.protocol!=='http:'||upstream.hostname!=='127.0.0.1'||![port,Number(upstream.port)].every(p=>p>0&&p<65536&&![4100,5173].includes(p)))throw new Error('Refusing non-isolated TLS proxy');
const server=createServer({key:readFileSync(process.env.OMNICOMPILE_TEST_TLS_KEY),cert:readFileSync(process.env.OMNICOMPILE_TEST_TLS_CERT)},(incoming,outgoing)=>{
  const proxied=request(new URL(incoming.url,upstream),{method:incoming.method,headers:incoming.headers},response=>{outgoing.writeHead(response.statusCode,response.headers);response.pipe(outgoing);});
  proxied.on('error',()=>{if(!outgoing.headersSent)outgoing.writeHead(502);outgoing.end();});incoming.pipe(proxied);
});
server.on('upgrade',(incoming,socket,head)=>{
  const proxied=request(new URL(incoming.url,upstream),{method:incoming.method,headers:incoming.headers});
  proxied.on('upgrade',(response,remote,remoteHead)=>{socket.write(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n`+Object.entries(response.headers).map(([key,value])=>`${key}: ${value}\r\n`).join('')+'\r\n');if(remoteHead.length)socket.write(remoteHead);if(head.length)remote.write(head);socket.pipe(remote).pipe(socket);socket.on('error',()=>remote.destroy());remote.on('error',()=>socket.destroy());socket.on('close',()=>remote.destroy());remote.on('close',()=>socket.destroy());});
  proxied.on('error',()=>socket.destroy());proxied.end();
});
server.listen(port,'127.0.0.1',()=>console.log('Owned loopback TLS proxy ready'));
