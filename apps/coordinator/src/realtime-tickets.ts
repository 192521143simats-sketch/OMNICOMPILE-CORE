import {createHash,randomBytes} from 'node:crypto';
type Role='admin'|'worker';
export class RealtimeTickets {
  private readonly tickets=new Map<string,{role:Role;origin:string;credential:string;expires:number}>();
  constructor(private readonly now=Date.now){}
  issue(role:Role,origin:string,credential:string):string {
    for(const [key,value] of this.tickets)if(value.expires<=this.now())this.tickets.delete(key);
    if(this.tickets.size>=4096)throw new Error('Realtime connection capacity reached. Retry shortly.');
    const token=randomBytes(32).toString('base64url');
    this.tickets.set(this.digest(token),{role,origin,credential,expires:this.now()+30000});return token;
  }
  consume(token:string|undefined,role:Role,origin:string|undefined):string|undefined {
    if(!token||!origin)return;
    const key=this.digest(token),value=this.tickets.get(key);
    if(!value)return;
    if(value.expires<=this.now()){this.tickets.delete(key);return;}
    if(value.role!==role||value.origin!==origin)return;
    this.tickets.delete(key);return value.credential;
  }
  private digest(token:string){return createHash('sha256').update(token).digest('hex');}
}
