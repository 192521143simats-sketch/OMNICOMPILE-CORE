import React from "react";
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
    expect(android).toContain('href="/join/shared/android"');

    const closed = renderToStaticMarkup(<WorkerChoices token="shared" accepting={false} />);
    expect(closed).not.toContain("href=");
  });
});
