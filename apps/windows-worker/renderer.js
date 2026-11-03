const $=id=>document.getElementById(id);
let busy=false;
function render(state){
  $('status').textContent=state.status;$('error').textContent=state.error??'';
  $('version').textContent=`Version ${state.version} · Protocol ${state.protocolVersion} · Windows x64`;
  $('enroll').disabled=busy||state.hasEnrollment;for(const id of ['connect','pause','disconnect','leave','rotate'])$(id).disabled=busy||!state.hasEnrollment;
  if(state.credentialSavePending){$('connect').disabled=true;$('leave').disabled=true;$('rotate').textContent='Retry credential rotation';}else $('rotate').textContent='Rotate private credential';
  $('save').disabled=busy;$('logs').disabled=busy;
  $('importCredential').disabled=busy||!state.hasEnrollment||state.credentialSavePending;
  const profile=state.profile,resources=state.resources,summary=state.serverSummary,limits=state.resourceLimits;
  const fields=[['Worker ID',state.nodeId||'Not registered'],['Network',summary?.networkName||state.networkId||'Not enrolled'],['Coordinator',state.coordinator||'Not configured'],
    ['CPU',profile?`${profile.cpuModel} · ${profile.logicalCores} logical cores`:'Not profiled'],['Total RAM',profile?`${(profile.totalMemoryBytes/1024**3).toFixed(2)} GB`:'Not profiled'],
    ['Current CPU',resources?`${resources.cpuUtilizationPercent.toFixed(1)}%`:'Not measured'],['Available RAM',resources?`${(resources.freeMemoryBytes/1024**2).toFixed(0)} MB`:'Not measured'],
    ['OS worker limits',limits?`${limits.cpuRate/100}% CPU · ${limits.memoryBytes/1024**2} MB committed memory`:'Not attached'],
    ['Toolchains',profile?Object.entries(profile.toolchains).map(([name,value])=>`${name}: ${value.available?value.version??'available':'unavailable'}`).join(' · '):'Not profiled'],
    ['Current task',state.currentTask||'None'],['Local results submitted',state.submitted],['Local tasks failed',state.failed],['Coordinator accepted',summary?.completed??'Not available'],
    ['Coordinator failures',summary?.failed??'Not available'],['Coordinator reliability',summary?.reliabilityPercent==null?'Not available':`${summary.reliabilityPercent.toFixed(2)}%`],['Last heartbeat',state.lastHeartbeat||'None']];
  $('details').replaceChildren();for(const [label,value]of fields){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=String(value);$('details').append(dt,dd);}
  $('activity').textContent=state.recent.map(event=>`${event.at} ${event.status}`).join('\n');
}
async function act(type,value){
  if(busy)return;busy=true;document.querySelectorAll('button').forEach(button=>button.disabled=true);
  let error='';
  try{const result=await window.omnicompile.act(type,value);if(result.error)error=result.error;else render(result);}
  catch{error='The desktop service could not complete this action.';}
  finally{busy=false;render(await window.omnicompile.snapshot());if(error)$('error').textContent=error;}
}
$('enroll').addEventListener('click',()=>act('enroll',{invitation:$('invitation').value,consent:$('consent').checked}));
for(const id of ['connect','pause','disconnect','leave','rotate'])$(id).addEventListener('click',()=>act(id));
$('importCredential').addEventListener('click',async()=>{await act('importCredential',{credential:$('replacement-credential').value,enrollmentId:$('replacement-enrollment').value.trim()});$('replacement-credential').value='';});
$('save').addEventListener('click',()=>act('settings',{maxCpuPercent:Number($('cpu').value),maxMemoryMB:Number($('memory').value),maxTaskDurationSeconds:Number($('duration').value),allowNative:$('native').checked}));
$('logs').addEventListener('click',async()=>{const result=await window.omnicompile.act('logs');if(result.error)$('error').textContent=result.error;else $('activity').textContent=result.location+'\n'+result.recent.map(event=>`${event.at} ${event.status}`).join('\n');});
window.omnicompile.onState(render);
window.omnicompile.snapshot().then(state=>{if(state.settings){$('cpu').value=state.settings.maxCpuPercent;$('memory').value=state.settings.maxMemoryMB;$('duration').value=state.settings.maxTaskDurationSeconds;$('native').checked=state.settings.allowNative;}render(state);});
