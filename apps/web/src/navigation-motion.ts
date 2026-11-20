/** Presentation only: retain document navigation, auth destinations and native downloads. */
let pending=false;
let generation=0;
let reset=()=>{};
export function navigateWithMotion(path:string,assign:(url:string)=>void=url=>location.assign(url)){
  if(pending)return;
  if(document.documentElement.dataset.reducedMotion==='true'||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||!document.body.animate){assign(path);return;}
  pending=true;
  const owner=++generation;
  const body=document.body,wasInert=body.inert;
  body.inert=true;
  let animation:Animation;
  try{animation=body.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-6px)'}],{duration:160,easing:'ease',fill:'forwards'});}
  catch{body.inert=wasInert;pending=false;assign(path);return;}
  let timer:ReturnType<typeof setTimeout>;
  reset=()=>{generation++;clearTimeout(timer);animation.cancel();body.inert=wasInert;pending=false;};
  const timeout=new Promise<void>(resolve=>{timer=setTimeout(resolve,240);});
  void Promise.race([animation.finished.catch(()=>{}),timeout]).then(()=>{
    if(owner!==generation)return;
    clearTimeout(timer);
    try{assign(path);timer=setTimeout(reset,2500);}catch(error){reset();throw error;}
  });
}
export function isMotionLink(link:HTMLAnchorElement,event:Pick<MouseEvent,'button'|'defaultPrevented'|'metaKey'|'ctrlKey'|'shiftKey'|'altKey'>,current=location.href){
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||link.hasAttribute('download')||(link.target&&link.target!=='_self')||link.relList.contains('external'))return false;
  const url=new URL(link.href,current),here=new URL(current);
  return /^https?:$/.test(url.protocol)&&url.origin===here.origin&&!/^\/(?:api|ws)(?:\/|$)/.test(url.pathname)&&(url.pathname!==here.pathname||url.search!==here.search);
}
export function installNavigationMotion(){
  const click=(event:MouseEvent)=>{
    const link=event.target instanceof Element?event.target.closest<HTMLAnchorElement>('a[href]'):null;
    if(!link||!isMotionLink(link,event))return;
    // No animation means no interception: modified clicks, downloads and hashes stay native.
    if(document.documentElement.dataset.reducedMotion==='true'||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||!document.body.animate)return;
    event.preventDefault();navigateWithMotion(link.href);
  };
  const shown=()=>reset();
  document.addEventListener('click',click);window.addEventListener('pageshow',shown);
  return()=>{document.removeEventListener('click',click);window.removeEventListener('pageshow',shown);reset();};
}
