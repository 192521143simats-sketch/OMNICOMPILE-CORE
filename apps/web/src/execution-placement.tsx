import 'react';

export type ExecutionMode='CLOUD_ONLY'|'LOCAL_ONLY'|'HYBRID';
const labels:Record<ExecutionMode,string>={CLOUD_ONLY:'Cloud Only',LOCAL_ONLY:'Local Only',HYBRID:'Hybrid — local preferred, cloud fallback'};
export function ExecutionPlacement({job}:{job:{executionMode?:ExecutionMode;executionLocations?:string[]}|null}){
  if(!job)return null;
  return <dl aria-label="Compilation placement">
    <dt>Execution routing</dt><dd>{job.executionMode?labels[job.executionMode]:'Not recorded'}</dd>
    <dt>Assigned worker locations</dt><dd>{job.executionLocations?.length?job.executionLocations.join(', '):'Awaiting worker assignment'}</dd>
  </dl>;
}
