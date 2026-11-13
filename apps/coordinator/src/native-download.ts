import {createHash, randomBytes} from "node:crypto";
import type {FastifyInstance} from "fastify";
import type {Pool, ResultSetHeader, RowDataPacket} from "mysql2/promise";
import {z} from "zod";
import type {DistributionEntry, LocalDistributionRegistry} from "./distribution.js";
import type {NetworkService} from "./networks.js";

const apiError = (code: string, message: string) => ({error:{code, message}});
const platformSchema = z.enum(["ANDROID", "WINDOWS"]);
type Platform = z.infer<typeof platformSchema>;
const authorizeSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{16,256}$/),
  platform: platformSchema,
}).strict();
const cookieName = "omnicompile_native_download";
const lifetimeSeconds = 300;
const downloadPath = (platform: Platform) => "/api/distribution/" + platform + "/download";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const workerType = (platform: Platform) => platform === "ANDROID" ? "ANDROID" : "NATIVE";

/** Compatibility hint only. A user agent is not native identity or attestation. */
export function compatibleBrowserPlatform(userAgent: string | undefined): Platform | null {
  if (!userAgent || /\bWindows Phone\b/i.test(userAgent)) return null;
  const android = /\bAndroid (\d+)(?:\.(\d+))?\b/i.exec(userAgent);
  if (android) {
    const major = Number(android[1]), minor = Number(android[2] ?? 0);
    return major > 7 || major === 7 && minor >= 1 ? "ANDROID" : null;
  }
  if (/\bAndroid\b/i.test(userAgent)) return null;
  return /\bWindows NT 10\.0\b/i.test(userAgent) ? "WINDOWS" : null;
}

function invitationAllows(
  network: Awaited<ReturnType<NetworkService["inspectJoinToken"]>>,
  platform: Platform,
): network is NonNullable<typeof network> {
  return !!network?.accepting && (!("workerTypes" in network) || !network.workerTypes || network.workerTypes.includes(workerType(platform)));
}

export function registerNativeDownloadRoutes(app: FastifyInstance, {
  networks, pool, local, published, secure,
}: {
  networks: NetworkService;
  pool: Pool;
  local: LocalDistributionRegistry;
  published: DistributionEntry[];
  secure: boolean;
}) {
  async function packageMetadata() {
    const localEntries = await local.metadata();
    return (["WINDOWS", "ANDROID"] as const).map(platform => {
      const entry = published.find(item => item.platform === platform);
      if (entry) {
        const {url: _url, ...publicFields} = entry;
        return {...publicFields, available: true, localAvailable: false};
      }
      const candidate = localEntries.find(item => item.platform === platform);
      if (!candidate || !("localDownloadUrl" in candidate)) return {platform, available: false, localAvailable: false};
      const {localDownloadUrl: _url, ...publicFields} = candidate;
      return {...publicFields, available: false};
    });
  }

  app.get("/api/distribution", {config:{rateLimit:{max:30,timeWindow:"1 minute"}}}, async(_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return {platforms: await packageMetadata()};
  });

  app.post("/api/enrollment/download-authorize", {config:{rateLimit:{max:12,timeWindow:"1 minute"}}}, async(request, reply) => {
    reply.header("Cache-Control", "no-store");
    const parsed = authorizeSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(apiError("INVALID_DOWNLOAD_REQUEST", "Choose a supported native worker."));
    const {platform, token} = parsed.data;
    const browserPlatform = compatibleBrowserPlatform(request.headers["user-agent"]);
    if (browserPlatform !== platform) return reply.code(403).send(apiError(
      "INCOMPATIBLE_DOWNLOAD_PLATFORM",
      platform === "ANDROID" ? "Open this page on Android 7.1 or later." : "Open this page on Windows 10 or later.",
    ));
    const invitationHash = digest(token);
    const network = await networks.inspectJoinTokenHash(invitationHash);
    if (!invitationAllows(network, platform)) {
      return reply.code(410).send(apiError("INVITATION_UNAVAILABLE", "This invitation cannot authorize that worker package."));
    }
    const artifact = (await packageMetadata()).find(item => item.platform === platform);
    if (!artifact || !artifact.available && !artifact.localAvailable) {
      return reply.code(404).send(apiError("PACKAGE_UNAVAILABLE", "A verified package is not available for this coordinator."));
    }
    const credential = randomBytes(32).toString("base64url");
    await pool.execute("DELETE FROM native_download_grants WHERE expires_at <= UTC_TIMESTAMP(3) LIMIT 100");
    await pool.execute(
      `INSERT INTO native_download_grants
        (token_hash, invitation_token_hash, network_id, platform, browser_platform, issued_at, expires_at)
        VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3), TIMESTAMPADD(SECOND, ?, UTC_TIMESTAMP(3)))`,
      [digest(credential), invitationHash, network.id, platform, browserPlatform, lifetimeSeconds],
    );
    reply.setCookie(cookieName, credential, {
      httpOnly: true, sameSite: "strict", secure, path: downloadPath(platform), maxAge: lifetimeSeconds,
    });
    return {artifact, downloadUrl: downloadPath(platform), expiresInSeconds: lifetimeSeconds};
  });

  app.get("/api/distribution/:platform/download", {
    exposeHeadRoute: false,
    config: {rateLimit:{max:10,timeWindow:"1 minute"}},
  }, async(request, reply) => {
    reply.header("Cache-Control", "no-store").header("Referrer-Policy", "no-referrer");
    const parsed = platformSchema.safeParse((request.params as {platform:string}).platform);
    if (!parsed.success) return reply.code(404).send(apiError("PACKAGE_UNAVAILABLE", "This package is unavailable."));
    const platform = parsed.data;
    const credential = request.cookies[cookieName];
    if (compatibleBrowserPlatform(request.headers["user-agent"]) !== platform || !credential || !/^[A-Za-z0-9_-]{43}$/.test(credential)) {
      return reply.code(403).send(apiError("DOWNLOAD_AUTHORIZATION_REQUIRED", "Authorize the package from a compatible device."));
    }
    const tokenHash = digest(credential);
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT invitation_token_hash AS invitationHash, network_id AS networkId FROM native_download_grants
       WHERE token_hash=? AND platform=? AND redeemed_at IS NULL AND expires_at>UTC_TIMESTAMP(3)`,
      [tokenHash, platform],
    );
    const grant = rows[0];
    const network = grant ? await networks.inspectJoinTokenHash(String(grant.invitationHash)) : null;
    if (!invitationAllows(network, platform) || network.id !== grant?.networkId) {
      return reply.code(403).send(apiError("DOWNLOAD_AUTHORIZATION_REQUIRED", "The authorization or invitation is no longer valid."));
    }
    const [claim] = await pool.execute<ResultSetHeader>(
      `UPDATE native_download_grants SET redeemed_at=UTC_TIMESTAMP(3)
       WHERE token_hash=? AND platform=? AND redeemed_at IS NULL AND expires_at>UTC_TIMESTAMP(3)`,
      [tokenHash, platform],
    );
    if (claim.affectedRows !== 1) return reply.code(403).send(apiError("DOWNLOAD_AUTHORIZATION_REQUIRED", "Authorize the package again."));
    reply.clearCookie(cookieName, {path:downloadPath(platform), httpOnly:true, sameSite:"strict", secure});
    const remote = published.find(item => item.platform === platform);
    if (remote) return reply.redirect(remote.url);
    const item = await local.download(platform);
    if (!item) return reply.code(404).send(apiError("PACKAGE_UNAVAILABLE", "The package is unavailable or failed integrity verification."));
    return reply.header("Content-Type", "application/octet-stream")
      .header("Content-Length", item.sizeBytes)
      .header("Content-Disposition", 'attachment; filename="' + item.fileName + '"')
      .header("X-Content-SHA256", item.sha256)
      .send(item.stream);
  });
}
