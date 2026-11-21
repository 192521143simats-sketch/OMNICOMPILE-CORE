import 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {Home} from './landing.js';

describe('cinematic public entry',()=>{
  it('has one authentication CTA leading to the established login route',()=>{
    const html=renderToStaticMarkup(<Home/>);
    expect(html.match(/href="\/login"/g)).toHaveLength(1);
    expect(html).toContain('GET STARTED');
    expect(html).not.toMatch(/Sign in|Register|Become a Worker/);
    expect(html).toContain('Compile Without');expect(html).toContain('Limits.');
  });
  it('preserves the existing wordmark and keyboard entry without announcing decorative orbits',()=>{
    const html=renderToStaticMarkup(<Home/>);
    expect(html).toContain('Skip to content');expect(html).toContain('id="main-content"');
    expect(html).toContain('OmniCompile Core');expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('Distributed compiler infrastructure built for Windows, Web, and Android workers.');
    expect(html).toContain('Distributed Compiler Infrastructure');
  });
});
