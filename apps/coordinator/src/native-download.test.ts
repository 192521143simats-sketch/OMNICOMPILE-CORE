import {describe, expect, it} from "vitest";
import {compatibleBrowserPlatform} from "./native-download.js";

describe("native download compatibility", () => {
  it.each([
    ["Mozilla/5.0 (Linux; Android 7.1.2; Redmi Y1 Lite) Chrome/130.0", "ANDROID"],
    ["Mozilla/5.0 (Linux; Android 10; K) Chrome/130.0 Mobile", "ANDROID"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0", "WINDOWS"],
    ["Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0", null],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile", null],
    ["Mozilla/5.0 (Windows Phone 10.0; Android 10) Edge", null],
    ["Mozilla/5.0 (Linux; Android 7.0; Device) Chrome/130.0", null],
    ["Mozilla/5.0 (Windows NT 6.1; Win64; x64) Chrome/130.0", null],
    [undefined, null],
  ])("classifies compatibility for %s", (userAgent, expected) => {
    expect(compatibleBrowserPlatform(userAgent)).toBe(expected);
  });
});
