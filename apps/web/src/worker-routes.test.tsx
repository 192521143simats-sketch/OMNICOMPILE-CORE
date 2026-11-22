import 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {workerPlatform,workerEntryPath,WorkerDirectory} from './worker-routes.js';
it('maps explicit worker pages and carries the invitation without changing API routes',()=>{
  expect(workerPlatform('/web-worker')).toBe('web');
  expect(workerPlatform('/browser-worker')).toBe('web');
  expect(workerPlatform('/windows-worker')).toBe('windows');
  expect(workerPlatform('/android-worker')).toBe('android');
  expect(workerPlatform('/unknown-worker')).toBeUndefined();
  expect(workerEntryPath('android','a/b')).toBe('/android-worker?token=a%2Fb');
});
it('offers each supported worker page without inventing an invitation',()=>{
  const html=renderToStaticMarkup(<WorkerDirectory/>);
  for(const type of ['web','windows','android'])expect(html).toContain(`href="/${type}-worker"`);
  expect(html).not.toContain('token=');
});

