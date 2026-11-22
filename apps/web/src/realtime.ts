import {api} from './api.js';
export const usesRealtimeTickets=import.meta.env.VITE_REALTIME_TICKETS==='true';
export async function realtimeUrl(role:'admin'|'worker'):Promise<string>{
  if(!usesRealtimeTickets)return `${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws/${role}`;
  const response=await api('/api/realtime/ticket',{method:'POST',body:JSON.stringify({role})});
  const url=new URL(response.url);
  if(url.protocol!=='wss:')throw new Error('Realtime connection requires WSS.');
  return url.toString();
}
