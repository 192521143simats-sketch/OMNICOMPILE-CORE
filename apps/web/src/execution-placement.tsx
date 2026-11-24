import 'react';

export type ExecutionMode='CLOUD_ONLY'|'LOCAL_ONLY'|'HYBRID';
export function ExecutionPlacement({job}:{job:{executionMode?:ExecutionMode;executionLocations?:string[];workerPlatforms?:string[]}|null}){
  if(!job)return null;
  const platforms=(job.workerPlatforms??[]).filter(value=>['Web','Windows','Android'].includes(value));
  return <dl aria-label="Compilation placement">
    <dt>Worker selection</dt><dd>Automatic — best eligible device in the selected network</dd>
    <dt>Assigned worker platforms</dt><dd>{platforms.length?platforms.join(', '):'Awaiting device worker assignment'}</dd>
  </dl>;
}
