import {expect, it} from 'vitest';
import {compilerStartupDiagnostic} from './compiler-service.js';

it('reports only allowlisted startup codes, excluding credential and path contents', () => {
  for (const code of ['CLOUD_TOOLCHAIN_UNAVAILABLE', 'ENOENT', 'EACCES', 'EADDRINUSE']) {
    expect(compilerStartupDiagnostic(Object.assign(new Error('credential-secret /private/credential-path'), {code})))
      .toEqual({message: 'Compiler service initialization failed', code});
  }
  expect(compilerStartupDiagnostic(Object.assign(new Error('credential-secret'), {code: '/private/credential-path'})))
    .toEqual({message: 'Compiler service initialization failed', code: 'INITIALIZATION_FAILED'});
});

it('redacts exceptions thrown by unknown error code accessors', () => {
  const hostile = {get code() {throw new Error('credential-secret /private/credential-path');}};
  expect(compilerStartupDiagnostic(hostile)).toEqual({message: 'Compiler service initialization failed', code: 'INITIALIZATION_FAILED'});
});
