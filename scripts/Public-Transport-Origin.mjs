export function publicTransportOrigin(value){
 const url=new URL(value);
 const approvedHost=/^[a-z0-9-]+\.(?:ngrok-free\.app|trycloudflare\.com)$/.test(url.hostname)||url.hostname==='omnicompile-server.tail4c8dab.ts.net';
 if(url.protocol!=="https:"||url.username||url.password||url.port||url.pathname!=="/"||url.search||url.hash||!approvedHost)throw new Error("Expected a trusted HTTPS public transport origin without credentials or paths.");
 return url.origin;
}
