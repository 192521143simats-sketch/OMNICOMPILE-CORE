import type {CapabilityProfile} from '@omnicompile/contracts';
export type WorkerLanguage = 'c' | 'python' | 'java';
export function languageProfile(detected: CapabilityProfile, language: WorkerLanguage): CapabilityProfile {
  if (!detected.runtimes[language] || !detected.toolchains[language].available) {
    throw new Error(`The ${language} worker image does not contain a working compiler.`);
  }
  const runtimes = {c: false, python: false, java: false};
  const toolchains: CapabilityProfile['toolchains'] = {c: {available: false}, python: {available: false}, java: {available: false}};
  runtimes[language] = true;
  toolchains[language] = detected.toolchains[language];
  return {...detected, runtimes, toolchains, operations: {...detected.operations, nativeCompilation: true, nativeCSource: language === 'c'}};
}
