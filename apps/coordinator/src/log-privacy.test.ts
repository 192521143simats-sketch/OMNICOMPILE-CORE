import {expect,it} from "vitest";
import {safeRequestLog} from "./log-privacy.js";

it("does not include invitation/reset/query credentials in request logs",()=>{
  for(const url of ['/api/join/private-invite/accept','/api/join-network-a/private-named/accept','/join-network-ab/private-named/windows','/join/private-invite','/reset-password?token=private-reset','/api/auth/login?password=private-password']){
    const logged=safeRequestLog({method:'POST',url});
    expect(JSON.stringify(logged)).not.toMatch(/private-/);
    expect(logged.method).toBe('POST');
  }
  expect(safeRequestLog({method:'GET',url:'/api/admin/nodes?page=2'})).toEqual({method:'GET',url:'/api/admin/nodes'});
});
