import {expect,it} from 'vitest';
import {pageRoute,pagePaths} from './page-routes.js';
it('names every supported page and normalizes refreshable bookmarks',()=>{
  for(const path of pagePaths){const page=pageRoute(path);expect(page.found,path).toBe(true);expect(page.title,path).toMatch(/OmniCompile Core/);}
  expect(pageRoute('/worker/')).toMatchObject({path:'/worker',redirect:'/worker'});
  expect(pageRoute('/browser-worker')).toMatchObject({redirect:'/web-worker'});
  expect(pageRoute('/join/shared/android').title).toContain('Android worker');
  expect(pageRoute('/join/shared/windows').title).toContain('Windows worker');
});
it('does not disguise nonexistent pages or backend paths as the landing page',()=>{
  for(const path of ['/missing-page','/api/auth/me','/ws/admin','/join/token/linux','/join/%E0%A4%A'])
    expect(pageRoute(path),path).toMatchObject({found:false,title:'Page not found | OmniCompile Core'});
  expect(pageRoute('/').title).toBe('OmniCompile Core');
});
