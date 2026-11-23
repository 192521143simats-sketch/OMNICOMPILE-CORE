import "react";
import {workerEntryPath} from "./worker-routes.js";

export type JoinPlatform = "web" | "android" | "windows";
export type JoinWorkerType = "BROWSER" | "ANDROID" | "NATIVE";

const platforms = [
  {route: "web", workerType: "BROWSER", title: "Web", description: "Contribute supported compute tasks from this browser."},
  {route: "android", workerType: "ANDROID", title: "Android", description: "Install the native Android app and review your contribution settings."},
  {route: "windows", workerType: "NATIVE", title: "Windows", description: "Install the Windows worker to contribute from your PC."},
] as const;

export function parseJoinRoute(pathname: string): {token: string; platform?: JoinPlatform; networkCode?:string} | null {
  const named=pathname.match(/^\/join-network-([a-z]+)\/([^/]+)(?:\/(web|android|windows))?\/?$/i);
  const match = named ? [named[0],named[2],named[3]] : pathname.match(/^\/join\/([^/]+)(?:\/(web|android|windows))?\/?$/);
  if (!match) return null;
  try {
    const token = decodeURIComponent(match[1]!);
    return {token,...(match[2]?{platform:match[2] as JoinPlatform}:{}),...(named?{networkCode:named[1]!.toUpperCase()}:{})};
  } catch {
    return null;
  }
}

export function joinPath(token: string, platform?: JoinPlatform,networkCode?:string): string {
  return (networkCode?`/join-network-${networkCode.toLowerCase()}/`:"/join/") + encodeURIComponent(token) + (platform ? "/" + platform : "");
}

export function joinAllowsPlatform(workerTypes: JoinWorkerType[] | undefined, platform: JoinPlatform): boolean {
  return !workerTypes || workerTypes.includes(platforms.find(choice => choice.route === platform)!.workerType);
}

export function WorkerChoices({token, accepting, workerTypes,networkCode}: {
  token: string;
  networkCode?:string|undefined;
  accepting: boolean;
  workerTypes?: JoinWorkerType[];
}) {
  return (
    <div className="grid three" aria-label="Worker platforms">
      {platforms.map(({route, title, description}) => {
        const label = "Continue as " + title + " Worker";
        return accepting && joinAllowsPlatform(workerTypes, route) ? (
          <a key={route} className="card action" href={networkCode?joinPath(token,route,networkCode):workerEntryPath(route, token)}>
            <h2>{label}</h2>
            <p>{description}</p>
          </a>
        ) : (
          <div key={route} className="card">
            <h2>{label}</h2>
            <p>{description}</p>
            <p>{accepting ? "This invitation does not allow this platform." : "Enrollment is unavailable."}</p>
          </div>
        );
      })}
    </div>
  );
}
