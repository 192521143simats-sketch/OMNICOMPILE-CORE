import {expect,it,vi} from 'vitest';
import {workerConnectionEndpoint} from './connection-endpoint.js';
it('discovers direct TLS transport through the canonical HTTPS coordinator without forwarding credentials on redirects',async()=>{
  const request=vi.fn(async()=>new Response(JSON.stringify({websocketUrl:'wss://backend.example.com/ws/worker'})));
  expect(await workerConnectionEndpoint('https://frontend.example.com','private-device',request as typeof fetch)).toBe('wss://backend.example.com/ws/worker');
  expect(request.mock.calls[0]).toEqual(['https://frontend.example.com/api/worker/connection',expect.objectContaining({redirect:'error',headers:{Authorization:'Bearer private-device'}})]);
});
it.each(['ws://backend.example.com/ws/worker','wss://user:secret@backend.example.com/ws/worker','wss://backend.example.com/ws/worker?credential=secret','wss://backend.example.com/other'])('rejects unsafe discovered destination %s',async websocketUrl=>{
  await expect(workerConnectionEndpoint('https://frontend.example.com','private-device',async()=>new Response(JSON.stringify({websocketUrl})))).rejects.toThrow();
});
it('keeps local isolated HTTP transport on the same origin',async()=>{
  const request=vi.fn();expect(await workerConnectionEndpoint('http://127.0.0.1:4100','private-device',request)).toBe('ws://127.0.0.1:4100/ws/worker');expect(request).not.toHaveBeenCalled();
});

it('allows the private Docker service only for the managed worker entry point',async()=>{
 const request=vi.fn();
 await expect(workerConnectionEndpoint('http://omnicompile-coordinator:4100','private-device',request)).rejects.toThrow();
 expect(await workerConnectionEndpoint('http://omnicompile-coordinator:4100','private-device',request,true)).toBe('ws://omnicompile-coordinator:4100/ws/worker');
 expect(await workerConnectionEndpoint('http://coordinator:4100','private-device',request,true)).toBe('ws://coordinator:4100/ws/worker');
 await expect(workerConnectionEndpoint('http://public.example.com','private-device',request,true)).rejects.toThrow();
});
