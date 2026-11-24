export function publicTransportOrigin(value){
 const url=new URL(value);
 if(url.protocol!=="https:"||url.username||url.password||url.port||url.pathname!=="/"||url.search||url.hash||! /^[a-z0-9-]+\.(?:ngrok-free\.app|trycloudflare\.com)$/.test(url.hostname))throw new Error("Expected a trusted HTTPS public transport origin without credentials or paths.");
 return url.origin;
}
