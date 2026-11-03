import {createHash,randomBytes,randomUUID,timingSafeEqual} from "node:crypto";
import {hash,verify} from "argon2";
import type {Pool,ResultSetHeader,RowDataPacket} from "mysql2/promise";

export type Role="ADMIN"|"USER";
export type AuthUser={id:string;name:string;email:string;role:Role};

const token=()=>randomBytes(32).toString("base64url");
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
export const passwordPolicy=(value:string)=>value.length>=12&&/[a-z]/.test(value)&&/[A-Z]/.test(value)&&/\d/.test(value)&&/[^A-Za-z0-9]/.test(value);
export const hashPassword=(value:string)=>hash(value,{type:2,memoryCost:19456,timeCost:2,parallelism:1});

export class AuthService{
  constructor(private readonly pool:Pool,private readonly sessionTtlHours:number,private readonly resetTtlMinutes:number){}

  async bootstrapAdmin(username:string,passwordHash?:string,password?:string){const email=`${username.trim().toLowerCase()}@omnicompile.local`,now=new Date().toISOString();const[rows]=await this.pool.execute<RowDataPacket[]>("SELECT id FROM users WHERE role='ADMIN' LIMIT 1");if(rows.length)return;const resolved=passwordHash||await hashPassword(password!);await this.pool.execute("INSERT INTO users(id,name,email,password_hash,role,status,created_at,updated_at) VALUES(?,?,?,?, 'ADMIN','ACTIVE',?,?)",[`USER-${randomUUID()}`,username,email,resolved,now,now]);}

  async signup(name:string,email:string,password:string){const normalized=email.trim().toLowerCase(),now=new Date().toISOString(),id=`USER-${randomUUID()}`;try{await this.pool.execute("INSERT INTO users(id,name,email,password_hash,role,status,created_at,updated_at) VALUES(?,?,?,?, 'USER','ACTIVE',?,?)",[id,name.trim(),normalized,await hashPassword(password),now,now]);return{id,name:name.trim(),email:normalized,role:"USER" as const};}catch(error:any){if(error?.code==="ER_DUP_ENTRY")return null;throw error;}}

  async authenticate(identifier:string,password:string){const normalized=identifier.trim().toLowerCase();const[rows]=await this.pool.execute<RowDataPacket[]>("SELECT id,name,email,password_hash passwordHash,role,status FROM users WHERE email=? OR (role='ADMIN' AND name=?) LIMIT 1",[normalized,identifier.trim()]);const row=rows[0];if(!row||row.status!=="ACTIVE")return null;const valid=await verify(String(row.passwordHash),password).catch(()=>false);return valid?{id:String(row.id),name:String(row.name),email:String(row.email),role:String(row.role) as Role}:null;}

  async createSession(user:AuthUser,ip:string,userAgent:string){const raw=token(),now=new Date().toISOString(),expiresAt=new Date(Date.now()+this.sessionTtlHours*3_600_000).toISOString();await this.pool.execute("INSERT INTO auth_sessions(token_hash,user_id,created_at,expires_at,ip_hash,user_agent_hash) VALUES(?,?,?,?,?,?)",[digest(raw),user.id,now,expiresAt,digest(ip),digest(userAgent)]);return{token:raw,expiresAt};}

  async session(raw:string|undefined){if(!raw)return null;const[rows]=await this.pool.execute<RowDataPacket[]>("SELECT u.id,u.name,u.email,u.role,s.expires_at expiresAt FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.status='ACTIVE'",[digest(raw),new Date().toISOString()]);const row=rows[0];return row?{id:String(row.id),name:String(row.name),email:String(row.email),role:String(row.role) as Role,expiresAt:String(row.expiresAt)}:null;}

  async revokeSession(raw:string|undefined){if(!raw)return;await this.pool.execute("UPDATE auth_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL",[new Date().toISOString(),digest(raw)]);}

  async createReset(email:string){const[rows]=await this.pool.execute<RowDataPacket[]>("SELECT id FROM users WHERE email=? AND status='ACTIVE'",[email.trim().toLowerCase()]);if(!rows[0])return null;const raw=token(),now=new Date().toISOString(),expiresAt=new Date(Date.now()+this.resetTtlMinutes*60_000).toISOString();await this.pool.execute("INSERT INTO password_reset_tokens(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)",[digest(raw),String(rows[0].id),now,expiresAt]);return{token:raw,expiresAt};}

  async resetPassword(raw:string,password:string){const connection=await this.pool.getConnection();try{await connection.beginTransaction();const[rows]=await connection.execute<RowDataPacket[]>("SELECT user_id userId,expires_at expiresAt,used_at usedAt FROM password_reset_tokens WHERE token_hash=? FOR UPDATE",[digest(raw)]);const row=rows[0];if(!row||row.usedAt||Date.parse(String(row.expiresAt))<=Date.now()){await connection.rollback();return false;}const now=new Date().toISOString();await connection.execute("UPDATE users SET password_hash=?,updated_at=? WHERE id=?",[await hashPassword(password),now,row.userId]);await connection.execute("UPDATE password_reset_tokens SET used_at=? WHERE token_hash=?",[now,digest(raw)]);await connection.execute("UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL",[now,row.userId]);await connection.commit();return true;}catch(error){await connection.rollback();throw error;}finally{connection.release();}}

  async audit(actorType:"ADMIN"|"USER"|"WORKER"|"SYSTEM",actorId:string|null,eventType:string,targetType:string|null=null,targetId:string|null=null,metadata:Record<string,unknown>={}){await this.pool.execute("INSERT INTO audit_events(id,actor_type,actor_id,event_type,target_type,target_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?)",[`AUDIT-${randomUUID()}`,actorType,actorId,eventType,targetType,targetId,JSON.stringify(metadata),new Date().toISOString()]);}
}
