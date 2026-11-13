import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import {WorkerInstallation} from "./worker-installation.js";

it("offers the same joining link for both native platforms and no fabricated download",()=>{
  const html=renderToStaticMarkup(<WorkerInstallation joinUrl="https://grid.example/join/shared" platforms={[]}/>);
  expect(html).toContain("Windows");expect(html).toContain("Android");
  expect(html).toContain("https://grid.example/join/shared");
  expect(html).toContain("Download unavailable");expect(html).not.toContain("download=");
});
it("shows version, checksum and byte size beside a verified artifact",()=>{
  const html=renderToStaticMarkup(<WorkerInstallation joinUrl="https://grid.example/join/shared" platform="WINDOWS" authorizedUrl="/api/distribution/WINDOWS/download" platforms={[{platform:"WINDOWS",available:true,version:"1.2.0",fileName:"worker.exe",sha256:"a".repeat(64),sizeBytes:1234}]}/>);
  expect(html).toContain("1.2.0");expect(html).toContain("1234 bytes");expect(html).toContain("a".repeat(64));expect(html).toContain("/api/distribution/WINDOWS/download");
});
it("labels a controlled local package as an unsigned prerelease instead of a published release",()=>{
  const html=renderToStaticMarkup(<WorkerInstallation joinUrl="https://grid.example/join/shared" platform="WINDOWS" authorizedUrl="/api/distribution/WINDOWS/download" platforms={[{platform:"WINDOWS",available:false,localAvailable:true,channel:"LOCAL_PRERELEASE",trust:"UNSIGNED_DEVELOPMENT",version:"1.2.0",fileName:"worker.exe",sha256:"a".repeat(64),sizeBytes:1234}]}/>);
  expect(html).toContain("Local prerelease");expect(html).toContain("Unsigned development package");expect(html).toContain("/api/distribution/WINDOWS/download");
});

it("shows only the chosen installer and passes the base link to the native app",()=>{
  const html=renderToStaticMarkup(
    <WorkerInstallation joinUrl="https://grid.example/join/shared" platforms={[]} platform="ANDROID"/>
  );
  expect(html).toContain("<h3>Android</h3>");
  expect(html).not.toContain("<h3>Windows</h3>");
  expect(html).toContain("https://grid.example/join/shared");
  expect(html).not.toContain("/join/shared/android");
});

it("does not display available packages without a server authorization",()=>{
  const html=renderToStaticMarkup(<WorkerInstallation platform="ANDROID" joinUrl="https://grid.example/join/shared" platforms={[{platform:"ANDROID",available:true,version:"1.2.0",fileName:"worker.apk",sha256:"a".repeat(64),sizeBytes:1234}]}/>);
  expect(html).toContain("Download unavailable");
  expect(html).not.toContain("download=");
});
