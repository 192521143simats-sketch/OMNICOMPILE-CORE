import type {DockerJob} from './docker-executor-schema.js';

export const executionLabel='omnicompile.io/execution-id';
export const prewarmLabel='omnicompile.io/prewarm-language';
export const prewarmLifetimeSeconds=240;
export const prewarmIdleSeconds=60;
export const executionTimeoutSeconds=112;
export const runnerCpuMillis=250;
export const runnerMemoryMiB=256;

export function prewarmInputName(podName:string,index:number){
  return podName+'-'+(index===40?'commit':'chunk-'+String(index).padStart(2,'0'));
}
export function executionManifest(id:string,image:string,runtimeClassName:string,count:number){
  if(!/^[a-z0-9][a-z0-9._:/-]*@sha256:[a-f0-9]{64}$/.test(image))throw new Error('Execution image must be digest pinned.');
  if(!/^[a-z0-9][a-z0-9.-]{0,62}$/.test(runtimeClassName))throw new Error('A sandbox RuntimeClass is required.');
  if(!Number.isInteger(count)||count<1||count>40)throw new Error('Invalid execution input size.');
  const name='omni-'+id;
  return {
    apiVersion:'batch/v1',kind:'Job',metadata:{name,labels:{[executionLabel]:id}},
    spec:{backoffLimit:0,activeDeadlineSeconds:105,ttlSecondsAfterFinished:300,parallelism:1,completions:1,
      template:{metadata:{labels:{[executionLabel]:id,'app':'omnicompile-execution'}},spec:{
        runtimeClassName,restartPolicy:'Never',automountServiceAccountToken:false,enableServiceLinks:false,
        terminationGracePeriodSeconds:2,securityContext:{runAsNonRoot:true,runAsUser:1000,runAsGroup:1000,fsGroup:1000,seccompProfile:{type:'RuntimeDefault'}},
        containers:[{name:'runner',image,command:['/bin/sh','-ec','cat /payload/* | node --import tsx apps/coordinator/src/compiler-job.ts'],
          securityContext:{readOnlyRootFilesystem:true,allowPrivilegeEscalation:false,capabilities:{drop:['ALL']}},
          resources:{requests:{cpu:runnerCpuMillis+'m',memory:runnerMemoryMiB+'Mi','ephemeral-storage':'128Mi'},limits:{cpu:'1',memory:'512Mi','ephemeral-storage':'256Mi'}},
          volumeMounts:[{name:'input',mountPath:'/payload',readOnly:true},{name:'tmp',mountPath:'/tmp'}]}],
        volumes:[{name:'tmp',emptyDir:{medium:'Memory',sizeLimit:'128Mi'}},
          {name:'input',projected:{sources:Array.from({length:count},(_,i)=>({configMap:{name:name+'-'+i,
            items:[{key:'payload',path:String(i).padStart(2,'0')}]}}))}}],
      }},
    },
  };
}

export function prewarmedManifest(name:string,language:DockerJob['language'],image:string,runtimeClassName:string){
  const spec=executionManifest('prewarm',image,runtimeClassName,1).spec.template.spec;
  const runner=spec.containers[0]!;
  const inputProjection={name:'input',projected:{sources:Array.from({length:41},(_,index)=>({
    configMap:{name:prewarmInputName(name,index),optional:true,
      items:[{key:'payload',path:index===40?'commit.json':'chunks'+String(index).padStart(2,'0')}]}
  }))}};
  return {
    apiVersion:'v1',kind:'Pod',
    metadata:{name,labels:{[prewarmLabel]:language,app:'omnicompile-execution'}},
    spec:{...spec,activeDeadlineSeconds:prewarmLifetimeSeconds,
      containers:[{...runner,
        command:['node','--import','tsx','apps/coordinator/src/compiler-job.ts','--prewarmed',language,name,String(prewarmLifetimeSeconds*1000)],
        readinessProbe:{exec:{command:['test','-f','/tmp/.omni-ready']},periodSeconds:1,timeoutSeconds:1},
      }],
      volumes:[spec.volumes[0]!,inputProjection] as const,
    },
  };
}
