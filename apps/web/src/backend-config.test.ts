import {afterEach,expect,it,vi} from 'vitest';
import {getBackendConfig} from './backend-config.js';
afterEach(()=>vi.unstubAllEnvs());
it('uses relative API routes for a bundled same-origin server deployment',()=>{
  vi.stubEnv('VITE_BACKEND_MODE','remote');vi.stubEnv('VITE_API_BASE_URL','same-origin');
  expect(getBackendConfig()).toEqual({mode:'remote',apiBaseUrl:null,wsBaseUrl:null});
});
it('retains configured remote endpoints and explicit offline hosting',()=>{
  vi.stubEnv('VITE_BACKEND_MODE','remote');vi.stubEnv('VITE_API_BASE_URL','https://app.example.com');vi.stubEnv('VITE_WS_BASE_URL','wss://app.example.com');
  expect(getBackendConfig()).toEqual({mode:'remote',apiBaseUrl:'https://app.example.com',wsBaseUrl:'wss://app.example.com'});
  vi.stubEnv('VITE_BACKEND_MODE','offline');expect(getBackendConfig().mode).toBe('offline');
});
