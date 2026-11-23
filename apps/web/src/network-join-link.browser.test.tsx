// @vitest-environment jsdom
import {act} from 'react';import {createRoot} from 'react-dom/client';import {expect,it,vi} from 'vitest';
import {NetworkJoinLink} from './network-join-link.js';
vi.mock('./backend-config.js',()=>({backendConfig:{mode:'remote',apiBaseUrl:null,wsBaseUrl:null},isBackendAvailable:()=>true}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
it('reveals a row link only on request, copies immediately, and retains a separate Copy button',async()=>{
 const url='https://example.test/join-network-a/private-fixture-token',copy=vi.fn(async()=>{});
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({joinUrl:url,enabled:true})));
 const previous=Object.getOwnPropertyDescriptor(navigator,'clipboard');Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:copy}});
 const host=document.createElement('div'),root=createRoot(host);
 try{
  await act(async()=>root.render(<NetworkJoinLink networkId="n1"/>));expect(host.querySelector('input')).toBeNull();expect(copy).not.toHaveBeenCalled();
  await act(async()=>host.querySelector('button')!.click());expect(host.querySelector('input')!.value).toBe(url);expect(copy).toHaveBeenCalledWith(url);
  const again=[...host.querySelectorAll('button')].find(button=>button.textContent==='Copy');expect(again).toBeDefined();
  await act(async()=>again!.click());expect(copy).toHaveBeenCalledTimes(2);
 }finally{await act(async()=>root.unmount());vi.unstubAllGlobals();if(previous)Object.defineProperty(navigator,'clipboard',previous);else Reflect.deleteProperty(navigator,'clipboard');}
});
