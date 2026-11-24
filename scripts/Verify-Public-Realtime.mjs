// Authenticated transport smoke; creates only a temporary admin session and revokes it.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import dotenv from 'dotenv';
import WebSocket from 'ws';
import {publicTransportOrigin} from './Public-Transport-Origin.mjs';
const origin='https://omnicompile-core-platform.vercel.app';
const transport=publicTransportOrigin((await readFile('.runtime/online-demo/operator-transport-url.txt','utf8')).trim());
const environment=dotenv.parse(await readFile('.env'));
let cookie;
async function request(path,body){return fetch(origin+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});}
try{
 const login=await request('/api/auth/login',{identifier:environment.ADMIN_USERNAME??'admin',password:environment.ADMIN_PASSWORD});
 assert.equal(login.status,200,'Saved administrator login must reach the coordinator');
 cookie=login.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie,'Administrator session cookie required');
 const response=await request('/api/realtime/ticket',{role:'admin'});assert.equal(response.status,200,'Ticket API must be reachable');
 const ticket=await response.json(),url=new URL(ticket.url);
 assert.equal(url.protocol,'wss:');assert.equal(url.hostname,new URL(transport).hostname);assert.equal(url.pathname,'/ws/admin');
 await new Promise((resolve,reject)=>{
  const socket=new WebSocket(url,{headers:{Origin:origin},handshakeTimeout:20000,maxPayload:2000000});
  const timer=setTimeout(()=>{socket.terminate();reject(new Error('Public authenticated WebSocket timed out'));},25000);
  const finish=(error)=>{clearTimeout(timer);socket.close();error?reject(error):resolve();};
  socket.once('error',()=>finish(new Error('Public WebSocket handshake failed')));
  socket.once('message',raw=>{try{assert.equal(JSON.parse(raw.toString()).type,'snapshot');finish();}catch{finish(new Error('Authenticated snapshot was not received'));}});
  socket.once('close',()=>{clearTimeout(timer);reject(new Error('Public WebSocket closed before verification'));});
 });
 await writeFile('.runtime/online-demo/realtime-audit.json',JSON.stringify({checkedAt:new Date().toISOString(),origin,transport,authenticatedAdminSnapshot:true},null,2)+'\n');
 console.log('PASS: Vercel login, ticket API and authenticated public WSS snapshot. No jobs or enrollments created.');
}finally{if(cookie){const logout=await request('/api/auth/logout',{});assert.equal(logout.status,204,'Smoke-test session must be revoked');}}
