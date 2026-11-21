import {useEffect,useState} from "react";

function reducedMotion(){
  return typeof document!=="undefined"&&(document.documentElement.dataset.reducedMotion==="true"||window.matchMedia?.("(prefers-reduced-motion: reduce)").matches===true);
}
function NoticeItem({text,kind}:{text:string|undefined;kind:"error"|"notice"}){
  const [retained,setRetained]=useState(text??"");
  const reduce=reducedMotion();
  useEffect(()=>{
    if(text){setRetained(text);return;}
    if(reduce){setRetained("");return;}
    if(!retained)return;
    const timer=window.setTimeout(()=>setRetained(""),200);
    return()=>window.clearTimeout(timer);
  },[text,reduce,retained]);
  const leaving=!text;
  const visible=text||(!reduce?retained:"");
  if(!visible)return null;
  return <div className={`${kind}${leaving?" notice-leaving":""}`} role={leaving?undefined:kind==="error"?"alert":"status"} aria-hidden={leaving?true:undefined} inert={leaving?true:undefined}>{visible}</div>;
}
export function Notice({error,message}:{error?:string;message?:string}){
  return <><NoticeItem text={error} kind="error"/><NoticeItem text={message} kind="notice"/></>;
}
