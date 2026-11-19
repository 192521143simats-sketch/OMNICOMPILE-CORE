import {afterEach, describe, expect, it, vi} from 'vitest';
import * as profiler from './profiler.js';
import {profile} from './profiler.js';
import {cloudProfile, languageProfile} from './cloud-profile.js';
import {mkdtempSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
describe('cloud language capability admission', () => {
  afterEach(() => {vi.restoreAllMocks(); vi.unstubAllEnvs();});
  it.each(['OMNICOMPILE_JDK_HOME', 'JAVA_HOME'])('retains %s fallback with the cloud discovery budget', async variable => {
    const home = mkdtempSync(join(tmpdir(), 'omnicompile-jdk-probe-'));
    const bin = join(home, 'bin');
    const executable = join(bin, process.platform === 'win32' ? 'javac.exe' : 'javac');
    mkdirSync(bin); writeFileSync(executable, 'owned existence fixture');
    try {
      vi.stubEnv('OMNICOMPILE_JDK_HOME', '');
      vi.stubEnv('JAVA_HOME', '');
      vi.stubEnv(variable, home);
      const probe = vi.spyOn(profiler, 'probeToolchain').mockImplementation(async command => command === executable
        ? {available: true, version: 'measured fallback version'} : {available: false});
      expect((await cloudProfile('java')).toolchains.java.version).toBe('measured fallback version');
      expect(probe).toHaveBeenCalledWith(executable, ['-version'], 15_000);
    } finally {unlinkSync(executable); rmdirSync(bin); rmdirSync(home);}
  });
  it('uses the bounded cloud discovery allowance and still requires a measured selected compiler', async () => {
    const probe = vi.spyOn(profiler, 'probeToolchain').mockResolvedValue({available: true, version: 'measured cloud version'});
    expect((await cloudProfile('java')).toolchains.java.version).toBe('measured cloud version');
    expect(probe).toHaveBeenCalledWith('javac', ['-version'], 15_000);
    probe.mockResolvedValue({available: false});
    await expect(cloudProfile('java')).rejects.toMatchObject({code: 'CLOUD_TOOLCHAIN_UNAVAILABLE'});
  });
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
