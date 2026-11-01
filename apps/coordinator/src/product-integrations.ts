import {randomUUID,createHash} from 'node:crypto';
export type IntegrationOutcome='disabled'|'unconfigured'|'rejected'|'accepted'|'failed';
export type SecurityNotificationEvent='PASSWORD_RESET_COMPLETED'|'SESSION_REVOKED';
export type IntegrationConfig={email?:{enabled:boolean;apiKey?:string|undefined;from?:string|undefined;publicBaseUrl?:string|undefined;timeoutMs?:number};analytics?:{enabled:boolean;apiKey?:string|undefined;host?:string|undefined;timeoutMs?:number}};
const events=new Set(['application_opened','signup_completed','login_completed','compiler_submission','job_completed','job_failed','worker_enrolled','worker_connected','worker_disconnected','network_created','task_completed','task_reassigned']);
const categories:Record<string,readonly string[]>={language:['C','PYTHON','JAVA'],status:['COMPLETED','FAILED','CANCELLED','PARTIAL_SUCCESS'],platform:['BROWSER','WINDOWS','ANDROID','LINUX','NODE'],taskKind:['COMPILE','BENCHMARK','MATRIX_MULTIPLY','PRIME_COUNT','SHA256','SHA256_CHAIN']};
function httpsOrigin(raw:string|undefined){try{const u=new URL(raw!);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/'?u.origin:null;}catch{return null;}}
const mailbox=(s:string|undefined)=>!!s&&s.length<=254&&/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(s);
/** Only the HTTPS transport is injectable; production uses the platform fetch. No SDK/autocapture/logging. */
export class ProductIntegrations{
 constructor(private readonly config:IntegrationConfig={},private readonly transport:typeof fetch=fetch){}
 private async post(url:string,body:unknown,headers:Record<string,string>,timeoutMs=1500):Promise<Record<string,unknown>|null>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([(async()=>{const response=await this.transport(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:controller.signal,redirect:'error'});if(!response.ok)return null;const data:unknown=await response.json();return data&&typeof data==='object'&&!Array.isArray(data)?data as Record<string,unknown>:null;})(),new Promise<null>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(null);},Math.min(5000,Math.max(10,timeoutMs)));})]);}catch{return null;}finally{if(timer)clearTimeout(timer);}
 }
 async sendPasswordReset(to:string,token:string):Promise<IntegrationOutcome>{
  const c=this.config.email;if(!c?.enabled)return 'disabled';const origin=httpsOrigin(c.publicBaseUrl);
  if(!c.apiKey||!mailbox(c.from)||!origin)return 'unconfigured';if(!mailbox(to)||!token||token.length>512)return 'rejected';
  const link=new URL('/reset-password',origin);link.searchParams.set('token',token);
  const response=await this.post('https://api.resend.com/emails',{from:c.from,to:[to],subject:'Reset your OmniCompile Core password',text:`A password reset was requested for your OmniCompile Core account. Use this expiring, single-use link: ${link.href}\nIf you did not request this, ignore this email.`},{Authorization:`Bearer ${c.apiKey}`,'Idempotency-Key':`password-reset/${createHash('sha256').update(token).digest('hex')}`},c.timeoutMs);
  return typeof response?.id==='string'&&response.id.length>0?'accepted':'failed';
 }
 async capture(event:string,consented:boolean,properties:Record<string,unknown>={}):Promise<IntegrationOutcome>{
  const c=this.config.analytics;if(!c?.enabled||!consented)return 'disabled';
  if(!c.apiKey||!['https://us.i.posthog.com','https://eu.i.posthog.com'].includes(httpsOrigin(c.host)??''))return 'unconfigured';if(!events.has(event))return 'rejected';
  const safe:Record<string,unknown>={};for(const [key,values] of Object.entries(categories)){const value=properties[key];if(typeof value==='string'&&values.includes(value))safe[key]=value;}
  const response=await this.post(`${httpsOrigin(c.host)}/capture/`,{api_key:c.apiKey,event,distinct_id:randomUUID(),properties:{...safe,$geoip_disable:true,$process_person_profile:false}},{},c.timeoutMs);
  return response?.status===1&&(!Array.isArray(response.quota_limited)||response.quota_limited.length===0)?'accepted':'failed';
 }
 async sendSecurityNotification(to:string,event:SecurityNotificationEvent):Promise<IntegrationOutcome>{
  const c=this.config.email;if(!c?.enabled)return 'disabled';
  if(!c.apiKey||!mailbox(c.from)||!httpsOrigin(c.publicBaseUrl))return 'unconfigured';
  if(!mailbox(to)||!['PASSWORD_RESET_COMPLETED','SESSION_REVOKED'].includes(event))return 'rejected';
  const text=event==='PASSWORD_RESET_COMPLETED'
   ?'Your OmniCompile Core password was changed. Existing login sessions have been revoked. If you did not make this change, contact your administrator.'
   :'A login session for your OmniCompile Core account was revoked. If you did not make this change, contact your administrator.';
  const response=await this.post('https://api.resend.com/emails',{from:c.from,to:[to],subject:'OmniCompile Core account security notification',text},{Authorization:`Bearer ${c.apiKey}`,'Idempotency-Key':`security-notification/${randomUUID()}`},c.timeoutMs);
  return typeof response?.id==='string'&&response.id.length>0?'accepted':'failed';
 }
}
