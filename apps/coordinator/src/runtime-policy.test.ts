import {describe, expect, it} from "vitest";
import {createOriginPolicy, trustedProxyPolicy, validateProductionEnvironment,validateHeartbeatTimeouts} from "./runtime-policy.js";

describe("runtime security policy", () => {
  it("requires a strictly later offline deadline than the stale deadline",()=>{
    expect(()=>validateHeartbeatTimeouts(15000,30000)).not.toThrow();
    for(const pair of [[15000,15000],[30000,15000],[0,30000],[-1,30000],[15000,Infinity],[1.5,30000]]){
      expect(()=>validateHeartbeatTimeouts(pair[0]!,pair[1]!)).toThrow(/HEARTBEAT/);
    }
  });
  it("rejects development destinations even when they use HTTPS in production", () => {
    const safe={nodeEnv:"production",publicBaseUrl:"https://grid.example.com",adminPasswordHash:"$argon2id$v=19$m=19456,t=2,p=1$bootstrap$hash"};
    for(const host of ["localhost","worker.localhost","grid.local","grid.internal","app.test","app.invalid","app.example","router.home.arpa","127.0.0.1","127.1","10.0.0.5","172.16.1.1","192.168.1.2","169.254.1.1","100.64.1.1","[::1]","[fc00::1]","[fe80::1]","[fec0::1]","[::192.168.1.2]","[::ffff:192.168.1.2]","[2002:c0a8:102::1]","[3fff::1]","grid.example.com:5173"]){
      const endpoint=`https://${host}`;
      expect(()=>validateProductionEnvironment({...safe,publicBaseUrl:endpoint}),endpoint).toThrow();
      expect(()=>validateProductionEnvironment({...safe,coordinatorPublicUrl:endpoint}),endpoint).toThrow();
      expect(()=>createOriginPolicy(safe.publicBaseUrl,"production",endpoint),endpoint).toThrow();
    }
    expect(()=>validateProductionEnvironment({...safe,publicBaseUrl:"https://grid.example.com:8443"})).not.toThrow();
    expect(()=>validateProductionEnvironment({...safe,publicBaseUrl:"https://[2606:4700:4700::1111]"})).not.toThrow();
    expect(()=>validateProductionEnvironment({...safe,nodeEnv:"development",publicBaseUrl:"http://localhost:5173"})).not.toThrow();
  });
  it("rejects unconfigured private-LAN and malformed origins in production", () => {
    const allows = createOriginPolicy("https://grid.example.com", "production", "https://admin.example.com");
    expect(allows("https://grid.example.com")).toBe(true);
    expect(allows("https://admin.example.com")).toBe(true);
    for (const origin of ["http://192.168.1.10:5173", "https://grid.example.evil", "https://grid.example/path", "null", "not-a-url"]) expect(allows(origin)).toBe(false);
    expect(allows(undefined)).toBe(true); // Native bearer clients do not send Origin.
  });
  it("preserves LAN development but does not accept lookalike private hostnames", () => {
    const allows = createOriginPolicy("http://localhost:5173", "development");
    expect(allows("http://192.168.1.10:5173")).toBe(true);
    expect(allows("http://10.0.0.2:5173")).toBe(true);
    expect(allows("http://172.31.1.1:5173")).toBe(true);
    for (const origin of ["http://192.168.evil.example", "http://172.32.1.1", "http://10.evil.example", "http://8.8.8.8"]) expect(allows(origin)).toBe(false);
  });
  it("never trusts all forwarded addresses by default or by an accidental true value", () => {
    expect(trustedProxyPolicy(undefined)).toBe(false);
    expect(trustedProxyPolicy("false")).toBe(false);
    expect(trustedProxyPolicy("127.0.0.1,::1")).toEqual(["127.0.0.1", "::1"]);
    expect(() => trustedProxyPolicy("true")).toThrow(/explicit/);
  });
  it("fails closed on production plaintext passwords or HTTP public endpoints", () => {
    const safe = {nodeEnv:"production", publicBaseUrl:"https://grid.example.com", coordinatorPublicUrl:"https://api.example.com", adminPasswordHash:"$argon2id$v=19$m=19456,t=2,p=1$bootstrap$hash"};
    expect(() => validateProductionEnvironment(safe)).not.toThrow();
    expect(() => validateProductionEnvironment({...safe, publicBaseUrl:"http://grid.example"})).toThrow(/HTTPS/);
    expect(() => validateProductionEnvironment({...safe, adminPasswordHash:undefined, adminPassword:"unsafe"})).toThrow(/Argon2id/);
    expect(() => validateProductionEnvironment({...safe, adminPassword:"unsafe"})).toThrow(/plaintext/);
    expect(() => createOriginPolicy("https://grid.example.com", "production", "http://admin.example.com")).toThrow(/HTTPS/);
  });
});
