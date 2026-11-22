import {parseJoinRoute} from './worker-onboarding.js';
const titles:Record<string,string>={
  '/':'OmniCompile Core',
  '/login':'Sign in', '/signup':'Create account',
  '/forgot-password':'Request password reset', '/reset-password':'Choose a new password',
  '/admin':'Administration', '/dashboard':'Compiler dashboard',
  '/worker':'Worker platforms', '/web-worker':'Web worker',
  '/browser-worker':'Web worker', '/windows-worker':'Windows worker', '/android-worker':'Android worker',
  '/settings':'Compiler dashboard', '/compute':'Compiler dashboard',
};
export const pagePaths=Object.keys(titles);
export function pageRoute(input:string):{path:string;title:string;found:boolean;redirect?:string}{
  const path=input.replace(/\/+$/,'')||'/',join=parseJoinRoute(path);
  let title=titles[path];
  if(join)title=join.platform==='android'?'Android worker enrollment':join.platform==='windows'?'Windows worker enrollment':join.platform==='web'?'Web worker enrollment':'Join a distributed network';
  if(!title)return{path,title:'Page not found | OmniCompile Core',found:false};
  const redirect=path==='/browser-worker'?'/web-worker':input!==path?path:undefined;
  return{path,title:path==='/'?title:`${title} | OmniCompile Core`,found:true,...(redirect?{redirect}:{})};
}
