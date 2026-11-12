import React from "react";

export type JoinPlatform = "web" | "android" | "windows";
export type JoinWorkerType = "BROWSER" | "ANDROID" | "NATIVE";

const platforms = [
  {route: "web", workerType: "BROWSER", title: "Web", description: "Contribute supported compute tasks from this browser."},
  {route: "android", workerType: "ANDROID", title: "Android", description: "Install the native Android app and review your contribution settings."},
  {route: "windows", workerType: "NATIVE", title: "Windows", description: "Install the Windows worker to contribute from your PC."},
] as const;

export function parseJoinRoute(pathname: string): {token: string; platform?: JoinPlatform} | null {
  const match = pathname.match(/^\/join\/([^/]+)(?:\/(web|android|windows))?\/?$/);
  if (!match) return null;
  try {
    const token = decodeURIComponent(match[1]!);
    return match[2] ? {token, platform: match[2] as JoinPlatform} : {token};
  } catch {
    return null;
  }
}

export function joinPath(token: string, platform?: JoinPlatform): string {
  return "/join/" + encodeURIComponent(token) + (platform ? "/" + platform : "");
}

export function joinAllowsPlatform(workerTypes: JoinWorkerType[] | undefined, platform: JoinPlatform): boolean {
  return !workerTypes || workerTypes.includes(platforms.find(choice => choice.route === platform)!.workerType);
}

export function WorkerChoices({token, accepting, workerTypes}: {
  token: string;
  accepting: boolean;
  workerTypes?: JoinWorkerType[];
}) {
  return (
    <div className="grid three" aria-label="Worker platforms">
      {platforms.map(({route, title, description}) => {
        const label = "Continue as " + title + " Worker";
        return accepting && joinAllowsPlatform(workerTypes, route) ? (
          <a key={route} className="card action" href={joinPath(token, route)}>
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
