import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {ExecutionPreference,ExecutionPlacement} from './execution-placement.js';

describe('compilation worker placement',()=>{
  it('shows cloud default and locks changes during a job',()=>{
    const html=renderToStaticMarkup(<ExecutionPreference value="CLOUD_ONLY" disabled onChange={()=>{}}/>);
    expect(html).toContain('disabled=""');
    expect(html).toContain('value="CLOUD_ONLY" selected=""');
    expect(html).toContain('Your device needs no local compiler');
    expect(html).toContain('Independent verification');
  });
  it('distinguishes requested placement from server-reported assigned workers',()=>{
    const waiting=renderToStaticMarkup(<ExecutionPlacement job={{executionMode:'HYBRID'}}/>);
    expect(waiting).toContain('Awaiting worker assignment');
    const assigned=renderToStaticMarkup(<ExecutionPlacement job={{executionMode:'HYBRID',executionLocations:['CLOUD']}}/>);
    expect(assigned).toContain('local preferred, cloud fallback');
    expect(assigned).toContain('<dd>CLOUD</dd>');
    expect(assigned).not.toContain('Awaiting worker assignment');
  });
});
