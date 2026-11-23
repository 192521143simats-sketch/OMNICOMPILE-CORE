import {expect,it} from 'vitest';
import * as contracts from './index.js';
it('retains device consent and resource limits without exporting network scheduling policies',()=>{
  expect('networkPolicySchema' in contracts).toBe(false);
  expect(contracts.contributionPolicySchema.safeParse({enabled:false,wifiOnly:true,maxTaskDurationMs:1000}).success).toBe(true);
  for(const invalid of [{maxCpuPercent:101},{minBatteryPercent:-1},{maxMemoryBytes:0},{arbitraryShell:true}])expect(contracts.contributionPolicySchema.safeParse(invalid).success).toBe(false);
});
it('does not invent absent mobile telemetry',()=>{
  const basic={cpuUtilizationPercent:0,freeMemoryBytes:0,memoryUtilizationPercent:0,observedAt:'2026-10-13T10:00:00Z'};
  expect(contracts.resourceSchema.parse(basic)).not.toHaveProperty('batteryPercent');
  expect(contracts.resourceSchema.safeParse({...basic,batteryPercent:101}).success).toBe(false);
});
