import "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";
import {joinPath, parseJoinRoute, WorkerChoices} from "./worker-onboarding.js";

describe("worker onboarding", () => {
  it("preserves the base invitation across every supported platform route", () => {
    const token = "shared-invitation_token";
    expect(parseJoinRoute(joinPath(token))).toEqual({token});
    for (const platform of ["web", "android", "windows"] as const) {
      expect(parseJoinRoute(joinPath(token, platform))).toEqual({token, platform});
    }
    expect(parseJoinRoute("/join/%E0%A4%A")).toBeNull();
    expect(parseJoinRoute("/join/shared/linux")).toBeNull();
  });

  it("presents exactly three choices and leaves restricted choices inactive", () => {
    const all = renderToStaticMarkup(<WorkerChoices token="shared" accepting />);
    expect(all.match(/href=/g)).toHaveLength(3);
    expect(all).toContain("Continue as Web Worker");
    expect(all).toContain("Continue as Android Worker");
    expect(all).toContain("Continue as Windows Worker");

    const android = renderToStaticMarkup(
      <WorkerChoices token="shared" accepting workerTypes={["ANDROID"]} />
    );
    expect(android.match(/href=/g)).toHaveLength(1);
    expect(android).toContain('href="/android-worker?token=shared"');

    const closed = renderToStaticMarkup(<WorkerChoices token="shared" accepting={false} />);
    expect(closed).not.toContain("href=");
  });
});

it('keeps the network label across platform enrollment links',()=>{
 expect(joinPath('master-token','windows','A')).toBe('/join-network-a/master-token/windows');
 expect(parseJoinRoute('/join-network-ab/master-token/android')).toEqual({networkCode:'AB',token:'master-token',platform:'android'});
 const html=renderToStaticMarkup(<WorkerChoices token="master-token" networkCode="A" accepting/>);
 expect(html).toContain('/join-network-a/master-token/web');
});
