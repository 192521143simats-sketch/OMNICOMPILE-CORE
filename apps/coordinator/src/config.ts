import dotenv from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {readFileSync} from "node:fs";
import {createOriginPolicy, trustedProxyPolicy, validateProductionEnvironment,validateHeartbeatTimeouts} from "./runtime-policy.js";
import {parseDistributionManifest} from './distribution.js';

const projectRoot=resolve(fileURLToPath(new URL("../../../",import.meta.url)));
// Isolated runners supply a complete environment; do not inherit developer secrets.
if(!process.env.OMNICOMPILE_TEST_INSTANCE) dotenv.config({path:resolve(projectRoot,".env")});
function integer(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

export const config = {
  distributionManifest:parseDistributionManifest(process.env.OMNICOMPILE_DISTRIBUTION_MANIFEST),
  localDistributionManifest:process.env.OMNICOMPILE_LOCAL_DISTRIBUTION_MANIFEST,
  requireAdminApproval:process.env.OMNICOMPILE_REQUIRE_ADMIN_APPROVAL===undefined?process.env.NODE_ENV==='production':process.env.OMNICOMPILE_REQUIRE_ADMIN_APPROVAL==='true',
  productVersion: String(JSON.parse(readFileSync(resolve(projectRoot,"package.json"),"utf8")).version),
  host: process.env.HOST ?? "0.0.0.0",
  port: integer("PORT", 4100),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:5173",
  coordinatorPublicUrl: process.env.COORDINATOR_PUBLIC_URL,
  adminUsername: process.env.ADMIN_USERNAME ?? "admin",
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH,
  adminPassword: process.env.ADMIN_PASSWORD,
  nodeEnv: process.env.NODE_ENV ?? "development",
  allowedOrigins: process.env.ALLOWED_ORIGINS,
  trustedProxies: trustedProxyPolicy(process.env.TRUSTED_PROXIES),
  testInstance: process.env.OMNICOMPILE_TEST_INSTANCE,
  executionEnabled: ["docker","docker-broker"].includes(process.env.OMNICOMPILE_EXECUTION_MODE??"docker"),
  sessionTtlHours: integer("SESSION_TTL_HOURS", 12),
  resetTtlMinutes: integer("RESET_TTL_MINUTES", 20),
  integrations: {
    email: {enabled:process.env.RESEND_ENABLED==="true",apiKey:process.env.RESEND_API_KEY,from:process.env.RESEND_FROM,publicBaseUrl:process.env.PUBLIC_BASE_URL,timeoutMs:integer("INTEGRATION_TIMEOUT_MS",1500)},
    analytics: {enabled:process.env.POSTHOG_ENABLED==="true",apiKey:process.env.POSTHOG_PROJECT_KEY,host:process.env.POSTHOG_HOST,timeoutMs:integer("INTEGRATION_TIMEOUT_MS",1500)}
  },
  database: {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: integer("DB_PORT", 3307),
    name: process.env.DB_NAME ?? "omnicompile",
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? ""
  },
  heartbeatStaleMs: integer("HEARTBEAT_STALE_MS", 15_000),
  heartbeatOfflineMs: integer("HEARTBEAT_OFFLINE_MS", 30_000),
  taskTimeoutMs: integer("TASK_TIMEOUT_MS", 30_000)
  ,projectRoot
};

validateHeartbeatTimeouts(config.heartbeatStaleMs,config.heartbeatOfflineMs);
if (!config.database.password) throw new Error("DB_PASSWORD is required. Run START-OMNICOMPILE.bat to initialize .env.");
if (!config.adminPasswordHash && !config.adminPassword) throw new Error("ADMIN_PASSWORD_HASH or ADMIN_PASSWORD is required.");
validateProductionEnvironment(config);
if(config.testInstance && (config.nodeEnv==="production" || !/^[a-f0-9]{16}$/.test(config.testInstance) || config.database.name!==`omnicompile_test_${config.testInstance}` || [4100,5173].includes(config.port))) throw new Error("Invalid isolated test coordinator configuration");
export const allowedOrigin=createOriginPolicy(config.publicBaseUrl,config.nodeEnv,config.allowedOrigins);
