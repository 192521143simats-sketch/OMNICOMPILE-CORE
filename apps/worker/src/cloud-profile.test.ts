import {describe, expect, it} from 'vitest';
import {profile} from './profiler.js';
import {languageProfile} from './cloud-profile.js';
describe('cloud language capability admission', () => {
  it('advertises only the selected compiler, retaining its measured version', async () => {
    const detected = await profile(async () => ({available: true, version: 'measured fixture version'}));
    const selected = languageProfile(detected, 'java');
    expect(selected.runtimes).toEqual({c: false, python: false, java: true});
    expect(selected.toolchains.java.version).toBe('measured fixture version');
    expect(selected.toolchains.c.available).toBe(false);
    expect(selected.operations.nativeCSource).toBe(false);
  });
  it('rejects startup when its configured compiler is missing', async () => {
    const detected = await profile(async () => ({available: false}));
    expect(() => languageProfile(detected, 'python')).toThrow('working compiler');
  });
});
