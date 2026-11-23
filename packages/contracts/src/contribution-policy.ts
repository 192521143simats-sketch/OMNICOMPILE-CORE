import {z} from "zod";

const resourcePolicyFields={
  maxTaskDurationMs:z.number().int().min(1).max(3_600_000).optional(),
  minBatteryPercent:z.number().min(0).max(100).optional(),
  wifiOnly:z.boolean().optional(),
  chargingOnly:z.boolean().optional(),
  maxCpuPercent:z.number().min(1).max(100).optional(),
  maxMemoryBytes:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  thermalProtection:z.boolean().optional(),
  allowBackground:z.boolean().optional()
};
export const contributionPolicySchema=z.strictObject({enabled:z.boolean().optional(),...resourcePolicyFields});
export type ContributionPolicy=z.infer<typeof contributionPolicySchema>;
