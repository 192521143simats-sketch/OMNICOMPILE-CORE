import {useRef,useState} from 'react';
import {api} from './api.js';

export function NetworkJoinLink({networkId}:{networkId:string}){
  const [url,setUrl]=useState(''),[pending,setPending]=useState(false),[message,setMessage]=useState('');
  const field=useRef<HTMLInputElement>(null);
  async function copy(value:string){
    try{
      let copied=false;
      if(navigator.clipboard?.writeText)try{await navigator.clipboard.writeText(value);copied=true;}catch{}
      if(!copied){const temporary=document.createElement('textarea');temporary.value=value;temporary.style.position='fixed';temporary.style.left='-9999px';document.body.appendChild(temporary);try{temporary.select();copied=document.execCommand?.('copy')===true;}finally{temporary.remove();}}
      if(!copied)throw new Error('Clipboard blocked');setMessage('Link copied.');
    }catch{
      const input=field.current;if(input){input.focus();input.select();}
      setMessage('Link shown. Use Copy again, or select and copy the link.');
    }
  }
  async function show(){
    if(pending)return;setPending(true);setMessage('');
    try{const link=await api(`/api/admin/networks/${encodeURIComponent(networkId)}/join-link`);setUrl(link.joinUrl);await copy(link.joinUrl);}
    catch(cause){setMessage(cause instanceof Error?cause.message:'Unable to load this network link.');}
    finally{setPending(false);}
  }
  return <div className="network-join-link">
    <button type="button" disabled={pending} aria-expanded={!!url} onClick={()=>void show()}>{pending?'Loading link…':'Show / copy link'}</button>
    {url&&<div className="network-link-reveal"><label>Master network link<input ref={field} readOnly value={url}/></label><button type="button" className="secondary" onClick={()=>void copy(url)}>Copy</button></div>}
    {message&&<p role="status">{message}</p>}
  </div>;
}
