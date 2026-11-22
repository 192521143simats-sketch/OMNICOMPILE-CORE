import React,{useState} from 'react';
import {parseJoinRoute,type JoinPlatform} from './worker-onboarding.js';

export function workerPlatform(path:string):JoinPlatform|undefined {
  return ({'/web-worker':'web','/browser-worker':'web','/windows-worker':'windows','/android-worker':'android'} as Record<string,JoinPlatform>)[path.replace(/\/$/,'')];
}
export function workerEntryPath(platform:JoinPlatform,token:string):string {
  return `/${platform}-worker?token=${encodeURIComponent(token)}`;
}
export function WorkerDirectory({platform}:{platform?:JoinPlatform}) {
  const [invitation,setInvitation]=useState(''),[error,setError]=useState('');
  function proceed(event:React.FormEvent){
    event.preventDefault();
    try {
      const url=new URL(invitation,location.origin),join=parseJoinRoute(url.pathname);
      const token=join?.token??url.searchParams.get('token');
      if(!token)throw new Error('Paste the participation link supplied by your administrator.');
      location.assign(platform?workerEntryPath(platform,token):`/worker?token=${encodeURIComponent(token)}`);
    } catch {setError('Paste a valid participation link supplied by your administrator.');}
  }
  return <>
    <p>Join using an administrator-issued participation link. Opening a worker page does not enroll a device or authorize computation.</p>
    {!platform&&<div className="grid three">{(['web','windows','android'] as const).map(type=><a key={type} className="card action" href={`/${type}-worker`}><h2>{type==='web'?'Web':type==='windows'?'Windows':'Android'} worker</h2><p>{type==='web'?'Contribute supported tasks in your browser.':'Install and enroll the native worker application.'}</p></a>)}</div>}
    <form onSubmit={proceed} className="card"><label>Participation link<input type="url" required value={invitation} onChange={event=>setInvitation(event.target.value)} placeholder="Paste your administrator’s link"/></label><button type="submit">Continue to enrollment</button>{error&&<p role="alert">{error}</p>}</form>
    {platform==='web'&&<p><a href="/web-worker?reconnect=1">Reconnect an enrolled browser worker</a></p>}
    {platform&&<p><a href="/worker">Choose another worker platform</a></p>}
  </>;
}
