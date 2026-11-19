import type {CapabilityProfile} from '@omnicompile/contracts';
import {profile, probeToolchain} from './profiler.js';
// Cold container JVM discovery can exceed the interactive worker's 3 second budget.
// This allowance applies only to capability discovery, never task execution.
export async function cloudProfile(language: WorkerLanguage): Promise<CapabilityProfile> {
  return languageProfile(await profile((command, args) => probeToolchain(command, args, 15_000), true), language);
}
export type WorkerLanguage = 'c' | 'python' | 'java';
export function languageProfile(detected: CapabilityProfile, language: WorkerLanguage): CapabilityProfile {
  if (!detected.runtimes[language] || !detected.toolchains[language].available) {
    throw Object.assign(new Error(`The ${language} worker image does not contain a working compiler.`), {code: 'CLOUD_TOOLCHAIN_UNAVAILABLE'});
  }
  const runtimes = {c: false, python: false, java: false};
  const toolchains: CapabilityProfile['toolchains'] = {c: {available: false}, python: {available: false}, java: {available: false}};
  runtimes[language] = true;
  toolchains[language] = detected.toolchains[language];
  return {...detected, runtimes, toolchains, operations: {...detected.operations, nativeCompilation: true, nativeCSource: language === 'c'}};
}
