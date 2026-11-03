import WebSocket from 'ws';
import {encodeProtocolMessage,parseCoordinatorMessage} from '@omnicompile/contracts';
import {assertIsolatedTarget,verifyIsolatedCoordinator} from './Integration-Target.mjs';

const target=assertIsolatedTarget();await verifyIsolatedCoordinator(target);
const origin=process.env.PUBLIC_BASE_URL;
const check=(value,message)=>{if(!value)throw new Error(message);};
async function request(path,body,cookie){const response=await fetch(target.base+path,{method:body?'POST':'GET',headers:{origin,...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{status:response.status,body:response.status===204?null:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
const version=await request('/version');check(version.body.protocolVersion===2,'Coordinator version was not advertised');
const login=await request('/api/auth/login',{identifier:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD});check(login.status===200,'Protocol verifier admin login failed');
const network=await request('/api/admin/networks',{name:'Protocol boundary fixture',maxNodes:2},login.cookie);
const join=`/api${new URL(network.body.joinUrl).pathname}`;
const enrolled=await request(join+'/accept',{consent:true,workerType:'BROWSER',deviceIdentity:'protocol-logical-client'});check(enrolled.status===201,'Protocol fixture enrollment failed');
const url=target.base.replace(/^http/,'ws')+'/ws/worker';
async function invalidVersion(packet){await new Promise((resolve,reject)=>{
  const socket=new WebSocket(url,{headers:{Cookie:enrolled.cookie,Origin:origin}});let code;
  const timer=setTimeout(()=>{socket.terminate();reject(new Error('Invalid protocol rejection timed out'));},5000);
  socket.on('open',()=>socket.send(JSON.stringify(packet)));
  socket.on('message',raw=>{try{code=parseCoordinatorMessage(JSON.parse(raw.toString())).code;}catch(error){reject(error);}});
  socket.on('error',reject);socket.on('close',status=>{clearTimeout(timer);try{check(code==='PROTOCOL_INCOMPATIBLE'&&status===1008,'Invalid protocol was not rejected and closed');resolve();}catch(error){reject(error);}});
});}
await invalidVersion({type:'disconnect'});await invalidVersion({type:'disconnect',protocolVersion:99});
await new Promise((resolve,reject)=>{
  const socket=new WebSocket(url,{headers:{Cookie:enrolled.cookie}}),timer=setTimeout(()=>{socket.terminate();reject(new Error('Cookie WebSocket origin rejection timed out'));},5000);
  socket.on('unexpected-response',(_request,response)=>{clearTimeout(timer);response.resume();socket.terminate();try{check(response.statusCode===403,'Missing cookie Origin was admitted');resolve();}catch(error){reject(error);}});
  socket.on('open',()=>{clearTimeout(timer);socket.close();reject(new Error('Cookie WebSocket without Origin connected'));});
  socket.on('error',()=>{});
});
const profile={workerType:'BROWSER',deviceType:'DESKTOP',cpuModel:'Logical protocol fixture',logicalCores:1,totalMemoryBytes:0,operatingSystem:'Test only',architecture:'browser',runtimes:{c:false,python:false,java:false},toolchains:{c:{available:false},python:{available:false},java:{available:false}},operations:{irOptimization:true,staticAnalysis:true,browserCompute:true,nativeCompilation:false}};
await new Promise((resolve,reject)=>{
  const socket=new WebSocket(url,{headers:{Cookie:enrolled.cookie,Origin:origin}});let registered=false;
  const timer=setTimeout(()=>{socket.terminate();reject(new Error('Worker revocation test timed out'));},5000);
  socket.on('open',()=>socket.send(encodeProtocolMessage({type:'register',profile})));
  socket.on('message',raw=>{void(async()=>{const message=parseCoordinatorMessage(JSON.parse(raw.toString()));if(message.type==='registered'){registered=true;const revoked=await request(`/api/admin/nodes/${message.nodeId}/revoke`,{},login.cookie);check(revoked.status===204,'Node revocation failed');}})().catch(reject);});
  socket.on('error',reject);socket.on('close',code=>{clearTimeout(timer);try{check(registered&&code===1008,'Revoked worker connection was not closed');resolve();}catch(error){reject(error);}});
});
await verifyIsolatedCoordinator(target);
console.log(JSON.stringify({versionedHandshake:'passed',missingVersion:'rejected',unsupportedVersion:'rejected',cookieOrigin:'enforced',revocationClosesConnection:'passed',coordinatorStillReady:true,client:'logical test fixture, not physical device'}));
