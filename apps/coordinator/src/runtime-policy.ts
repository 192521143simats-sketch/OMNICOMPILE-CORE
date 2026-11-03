import {isIP} from "node:net";

export function validateHeartbeatTimeouts(staleMs:number,offlineMs:number):void {
  if(!Number.isSafeInteger(staleMs)||staleMs<=0||!Number.isSafeInteger(offlineMs)||offlineMs<=staleMs){
    throw new Error("HEARTBEAT_OFFLINE_MS must be greater than the positive integer HEARTBEAT_STALE_MS");
  }
}

function origin(value:string):string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error("Expected an HTTP(S) origin without credentials, path or query");
  return url.origin;
}

function productionOrigin(value:string):string {
  const normalized=origin(value),url=new URL(normalized),host=url.hostname.replace(/^\[|\]$/g,"").toLowerCase().replace(/\.$/,"");
  if(url.protocol!=="https:")throw new Error("Production public endpoints require HTTPS");
  const privateV4=(address:string)=>{const [a,b,c]=address.split(".").map(Number);return a===0||a===10||a===127||a!>=224||a===169&&b===254||a===172&&b!>=16&&b!<=31||a===192&&b===168||a===100&&b!>=64&&b!<=127||a===198&&(b===18||b===19)||a===192&&b===0&&(c===0||c===2)||a===198&&b===51&&c===100||a===203&&b===0&&c===113;};
  let nonpublic=false;
  if(isIP(host)===4)nonpublic=privateV4(host);
  else if(isIP(host)===6){
    // Only global-unicast space; reject obsolete site-local/compatible forms,
    // special protocol assignments, documentation and 6to4 transition addresses.
    const [first,second]=host.split(":").map(part=>parseInt(part||"0",16));
    nonpublic=(first!&0xe000)!==0x2000||host.startsWith("2001:db8:")||first===0x2001&&second!<0x200||first===0x2002||first===0x3fff&&second!<0x1000;
    if(host.startsWith("::ffff:")){
      const parts=host.slice(7).split(":");
      if(parts.length===2){const upper=parseInt(parts[0]!,16),lower=parseInt(parts[1]!,16);nonpublic=privateV4(`${upper>>8}.${upper&255}.${lower>>8}.${lower&255}`);}
      else nonpublic=true;
    }
  }else nonpublic=!host.includes(".")||/(^|\.)(localhost|local|internal|lan|home|test|invalid|example|onion|home\.arpa)$/.test(host)||/(^|\.)(trycloudflare\.com|ngrok-free\.app|loca\.lt)$/.test(host);
  if(nonpublic||["5173","4100"].includes(url.port))throw new Error("Production endpoints must use a public non-development address");
  return normalized;
}

export function createOriginPolicy(publicBaseUrl:string, nodeEnv:string, additional?:string) {
  const configured = [publicBaseUrl, ...(additional?.split(',').map(value => value.trim()).filter(Boolean) ?? [])].map(origin);
  if (nodeEnv === 'production') configured.forEach(productionOrigin);
  const allowed = new Set(configured);
  return (value:string|undefined) => {
    if (value === undefined) return true; // Cookie clients additionally require Origin at WS boundaries.
    try {
      const normalized = origin(value);
      if (value !== normalized) return false;
      if (allowed.has(normalized)) return true;
      if (nodeEnv === 'production') return false;
      const url = new URL(value), host = url.hostname;
      if (url.protocol !== 'http:') return false;
      if (host === 'localhost' || host === '127.0.0.1') return true;
      if (isIP(host) !== 4) return false;
      const [a,b] = host.split('.').map(Number);
      return a === 10 || (a === 192 && b === 168) || (a === 172 && b! >= 16 && b! <= 31);
    } catch { return false; }
  };
}

export function trustedProxyPolicy(value:string|undefined):false|string[] {
  if (!value || value === 'false') return false;
  if (value === 'true') throw new Error("TRUSTED_PROXIES requires explicit proxy IPs/CIDRs, not true");
  const addresses = value.split(',').map(item => item.trim());
  if (addresses.some(item => !item || !isIP(item.split('/')[0]!))) throw new Error("TRUSTED_PROXIES requires explicit proxy IPs/CIDRs");
  return addresses;
}

export function validateProductionEnvironment(config:{nodeEnv:string;publicBaseUrl:string;coordinatorPublicUrl?:string|undefined;adminPasswordHash?:string|undefined;adminPassword?:string|undefined}) {
  if (config.nodeEnv !== 'production') return;
  if (!config.adminPasswordHash?.startsWith('$argon2id$')) throw new Error("Production requires an Argon2id ADMIN_PASSWORD_HASH");
  if (config.adminPassword) throw new Error("Remove plaintext ADMIN_PASSWORD in production");
  for (const url of [config.publicBaseUrl, config.coordinatorPublicUrl].filter((item):item is string => Boolean(item))) productionOrigin(url);
}
