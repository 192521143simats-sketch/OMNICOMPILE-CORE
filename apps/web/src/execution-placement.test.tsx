import 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {ExecutionPlacement} from './execution-placement.js';
describe('device worker placement',()=>{
 it('shows only server-reported device platforms, never infrastructure as a worker',()=>{
  const waiting=renderToStaticMarkup(<ExecutionPlacement job={{executionMode:'HYBRID',executionLocations:['CLOUD']}}/>);
  expect(waiting).toContain('Awaiting device worker assignment');expect(waiting).not.toContain('CLOUD');
  const assigned=renderToStaticMarkup(<ExecutionPlacement job={{workerPlatforms:['Web','Windows','Android','Cloud']}}/>);
  expect(assigned).toContain('Web, Windows, Android');expect(assigned).not.toContain('Cloud');expect(assigned).not.toContain('<select');
 });
});
