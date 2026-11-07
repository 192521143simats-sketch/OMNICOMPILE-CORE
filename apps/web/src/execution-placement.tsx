import React from 'react';

export type ExecutionMode='CLOUD_ONLY'|'LOCAL_ONLY'|'HYBRID';
const labels:Record<ExecutionMode,string>={CLOUD_ONLY:'Cloud Only',LOCAL_ONLY:'Local Only',HYBRID:'Hybrid — local preferred, cloud fallback'};
const descriptions:Record<ExecutionMode,string>={
  CLOUD_ONLY:'Use administrator-approved cloud workers. Your device needs no local compiler.',
  LOCAL_ONLY:'Use compatible local native workers. Submission is rejected when none is connected.',
  HYBRID:'Prefer an eligible local worker and allow compatible cloud workers in the selected network.'
};

export function ExecutionPreference({value,onChange,disabled}:{value:ExecutionMode;onChange:(mode:ExecutionMode)=>void;disabled:boolean}){
  return <label>Compilation worker preference
    <select aria-label="Compilation worker preference" value={value} disabled={disabled} onChange={event=>onChange(event.target.value as ExecutionMode)}>
      {Object.entries(labels).map(([mode,label])=><option key={mode} value={mode}>{label}</option>)}
    </select>
    <small>{descriptions[value]} Independent verification and requested program execution use the configured isolated service.</small>
  </label>;
}

export function ExecutionPlacement({job}:{job:{executionMode?:ExecutionMode;executionLocations?:string[]}|null}){
  if(!job)return null;
  return <dl aria-label="Compilation placement">
    <dt>Worker preference</dt><dd>{job.executionMode?labels[job.executionMode]:'Legacy scheduling policy'}</dd>
    <dt>Assigned worker locations</dt><dd>{job.executionLocations?.length?job.executionLocations.join(', '):'Awaiting worker assignment'}</dd>
  </dl>;
}
