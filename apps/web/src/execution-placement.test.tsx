import 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {ExecutionPlacement} from './execution-placement.js';

describe('compilation worker placement',()=>{
  it('distinguishes requested placement from server-reported assigned workers',()=>{
    const waiting=renderToStaticMarkup(<ExecutionPlacement job={{executionMode:'HYBRID'}}/>);
    expect(waiting).toContain('Awaiting worker assignment');
    const assigned=renderToStaticMarkup(<ExecutionPlacement job={{executionMode:'HYBRID',executionLocations:['CLOUD']}}/>);
    expect(assigned).toContain('best eligible worker with toolchain support');
    expect(assigned).not.toContain('Worker preference');
    expect(assigned).not.toContain('<select');
    expect(assigned).toContain('<dd>CLOUD</dd>');
    expect(assigned).not.toContain('Awaiting worker assignment');
  });
});
