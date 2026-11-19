import {describe, expect, it} from 'vitest';
import {probeToolchain} from './profiler.js';

describe('bounded startup toolchain discovery', () => {
  it('measures a slow compiler with the cloud startup budget while the default remains bounded', async () => {
    const args = ['-e', 'setTimeout(()=>console.log("owned compiler version"),3500)'];
    expect(await probeToolchain(process.execPath, args)).toEqual({available: false});
    expect(await probeToolchain(process.execPath, args, 15_000)).toEqual({available: true, version: 'owned compiler version'});
  }, 20_000);

  it('still rejects missing compilers and kills a process exceeding its startup budget', async () => {
    expect(await probeToolchain('omnicompile-missing-owned-fixture', [], 15_000)).toEqual({available: false});
    const started = performance.now();
    expect(await probeToolchain(process.execPath, ['-e', 'setTimeout(()=>console.log("too late"),5000)'], 100)).toEqual({available: false});
    expect(performance.now() - started).toBeLessThan(3000);
  });

  it.each([0, -1, NaN, Infinity, 30_001])('rejects invalid discovery timeout %s', async timeout => {
    await expect(probeToolchain(process.execPath, ['--version'], timeout)).rejects.toThrow('timeout');
  });
});
