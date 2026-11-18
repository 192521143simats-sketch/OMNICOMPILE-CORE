import {createHash,randomUUID} from 'node:crypto';
import type {Pool,ResultSetHeader,RowDataPacket} from 'mysql2/promise';
import type {DockerJob} from './docker-executor-schema.js';
import type {ClusterApi} from './kubernetes-execution.js';
import {
  executionLabel,executionTimeoutSeconds,prewarmIdleSeconds,prewarmInputName,prewarmLabel,
  prewarmLifetimeSeconds,prewarmedManifest,
} from './kubernetes-manifests.js';

type Language=DockerJob['language'];
type Slot=RowDataPacket&{
  language:Language;pod_name:string;pod_uid:string|null;image:string;runtime_class:string;
  state:'PROVISIONING'|'IDLE'|'CLAIMED'|'RETIRING';execution_id:string|null;idle_live:number;
};
export type ClaimedPod={name:string;uid:string;language:Language};
const languages=['c','python','java'] as const;
const podLabel='omnicompile.io/prewarm-pod';

export class KubernetesPrewarmPool {
  private orphanCursor='';
  constructor(private readonly pool:Pool,private readonly api:ClusterApi,private readonly core:string,
    private readonly runtime:string,private readonly images:Record<Language,string>,private readonly enabled:boolean){}

  private podPath(name:string){return this.core+'/pods/'+name;}

  private matches(slot:Slot,pod:any){
    return typeof pod?.metadata?.uid==='string'&&pod.metadata.uid.length>0&&pod.metadata.name===slot.pod_name&&
      pod.metadata.labels?.[prewarmLabel]===slot.language&&
      (slot.pod_uid===null||pod.metadata.uid===slot.pod_uid)&&
      pod.spec?.runtimeClassName===slot.runtime_class&&pod.spec?.containers?.[0]?.image===slot.image;
  }

  async ready(){
    const [[slot]]=await this.pool.execute<Slot[]>('SELECT pod_name FROM kubernetes_prewarm_slots LIMIT 1')
      .catch(error=>{
        if(!this.enabled&&error?.code==='ER_NO_SUCH_TABLE')return [[]] as [Slot[]];
        throw error;
      });
    if(!this.enabled&&!slot)return;
    const signal=AbortSignal.timeout(3500);
    await Promise.all([
      this.api('GET',this.podPath(slot?.pod_name??'omni-warm-readiness'),undefined,signal),
      this.api('GET',this.core+'/configmaps?limit=1&labelSelector='+encodeURIComponent(podLabel),undefined,signal),
    ]);
  }

  async claim(id:string,language:Language,signal:AbortSignal):Promise<ClaimedPod|undefined>{
    const [[slot]]=await this.pool.execute<Slot[]>(`SELECT * FROM kubernetes_prewarm_slots
      WHERE language=? AND state='IDLE' AND idle_expires_at>UTC_TIMESTAMP(3)
        AND expires_at>=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3))`,[language,executionTimeoutSeconds]);
    if(!slot?.pod_uid||slot.image!==this.images[language]||slot.runtime_class!==this.runtime)return undefined;
    const pod=await this.api('GET',this.podPath(slot.pod_name),undefined,signal).catch(()=>null);
    const createdAt=Date.parse(pod?.metadata?.creationTimestamp);
    if(!this.matches(slot,pod)||pod.metadata.deletionTimestamp||pod.status?.phase!=='Running'||
      !pod.status?.conditions?.some((condition:{type:string;status:string})=>condition.type==='Ready'&&condition.status==='True')||
      !(createdAt+prewarmLifetimeSeconds*1000-Date.now()>=executionTimeoutSeconds*1000))return undefined;
    signal.throwIfAborted();
    const [claimed]=await this.pool.execute<ResultSetHeader>(`UPDATE kubernetes_prewarm_slots AS p
      JOIN kubernetes_executions AS e ON e.id=? AND e.language=p.language
      SET p.state='CLAIMED',p.execution_id=e.id
      WHERE p.language=? AND p.pod_name=? AND p.pod_uid=? AND p.state='IDLE'
        AND p.idle_expires_at>UTC_TIMESTAMP(3)
        AND p.expires_at>=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3))
        AND e.state='PROVISIONING' AND e.slot IS NOT NULL AND e.expires_at>UTC_TIMESTAMP(3)`,
    [id,language,slot.pod_name,slot.pod_uid,executionTimeoutSeconds]);
    if(claimed.affectedRows===0)return undefined;
    if(claimed.affectedRows!==1)throw new Error('Prewarmed claim could not be confirmed.');
    return {name:slot.pod_name,uid:slot.pod_uid,language};
  }

  async getPod(claim:ClaimedPod,signal:AbortSignal){
    const pod=await this.api('GET',this.podPath(claim.name),undefined,signal);
    if(pod?.metadata?.uid!==claim.uid||pod.metadata.deletionTimestamp||
      pod.metadata.labels?.[prewarmLabel]!==claim.language)throw new Error('Prewarmed Pod identity changed.');
    return pod;
  }

  async publish(claim:ClaimedPod,id:string,input:Buffer,chunkBytes:number,signal:AbortSignal){
    const count=Math.ceil(input.length/chunkBytes);
    for(let index=0;index<=count;index++){
      signal.throwIfAborted();
      const commit=index===count;
      const content=commit?Buffer.from(JSON.stringify({
        version:1,podId:claim.name,executionId:id,language:claim.language,chunkCount:count,
        byteLength:input.length,sha256:createHash('sha256').update(input).digest('hex'),
      })):input.subarray(index*chunkBytes,(index+1)*chunkBytes);
      const name=prewarmInputName(claim.name,commit?40:index);
      const created=await this.api('POST',this.core+'/configmaps',{
        apiVersion:'v1',kind:'ConfigMap',metadata:{name,labels:{[executionLabel]:id,[podLabel]:claim.name},
          ownerReferences:[{apiVersion:'v1',kind:'Pod',name:claim.name,uid:claim.uid}]},
        immutable:true,binaryData:{payload:content.toString('base64')},
      },signal);
      if(created?.metadata?.name!==name)throw new Error('Prewarmed input publication could not be confirmed.');
    }
  }

  async finish(id:string,hold:boolean):Promise<boolean|undefined>{
    const [[slot]]=await this.pool.execute<Slot[]>('SELECT * FROM kubernetes_prewarm_slots WHERE execution_id=?',[id]);
    if(!slot)return undefined;
    return this.remove(slot,hold);
  }

  private async remove(slot:Slot,hold=false){
    const path=this.podPath(slot.pod_name);
    let pod=await this.api('GET',path);
    if(pod!==null){
      if(!this.matches(slot,pod))throw new Error('Prewarmed Pod ownership could not be verified.');
      if(!pod.metadata.deletionTimestamp)await this.deleteResource(path,pod.metadata.uid);
      pod=await this.api('GET',path);
    }
    if(hold||pod!==null)return false;
    if(slot.execution_id){
      const selector=encodeURIComponent(podLabel+'='+slot.pod_name+','+executionLabel+'='+slot.execution_id);
      const collection=this.core+'/configmaps';
      const query=collection+'?limit=8&labelSelector='+selector;
      const signal=AbortSignal.timeout(20_000);
      const names=new Set(Array.from({length:41},(_,index)=>prewarmInputName(slot.pod_name,index)));
      const ownedMaps=await this.inputInventory(slot,query,names,signal);
      const deleted=await Promise.allSettled(ownedMaps.map(({name,uid})=>this.deleteResource(collection+'/'+name,uid,signal)));
      if(deleted.some(result=>result.status==='rejected'))return false;
      if(ownedMaps.length>0&&(await this.inputInventory(slot,query,names,signal)).length>0)return false;
    }
    await this.pool.execute('DELETE FROM kubernetes_prewarm_slots WHERE language=? AND pod_name=? AND state=?',
      [slot.language,slot.pod_name,slot.state]);
    return true;
  }

  private async inputInventory(slot:Slot,path:string,names:Set<string>,signal:AbortSignal){
    const inventory:{name:string;uid:string}[]=[];
    let cursor='';
    const seen=new Set<string>();
    for(let page=0;page<16;page++){
      const result=await this.listPage(path,cursor,signal);
      for(const map of result.items){
        const {name,uid,ownerReferences}=map.metadata??{};
        const owned=ownerReferences?.some((owner:any)=>owner.kind==='Pod'&&owner.name===slot.pod_name&&owner.uid===slot.pod_uid);
        if(!names.has(name)||typeof uid!=='string'||!uid||!owned)
          throw new Error('Prewarmed input ownership could not be verified.');
        inventory.push({name,uid});
      }
      if(inventory.length>names.size)break;
      cursor=result.cursor;
      if(!cursor)return inventory;
      if(seen.has(cursor))break;
      seen.add(cursor);
    }
    throw new Error('Prewarmed input inventory exceeds its bounds.');
  }

  private async listPage(path:string,cursor:string,signal:AbortSignal){
    const page=await this.api('GET',path+(cursor?'&continue='+encodeURIComponent(cursor):''),undefined,signal);
    const next=page?.metadata?.continue??'';
    if(!Array.isArray(page?.items)||typeof next!=='string'||next&&next===cursor)
      throw new Error('Prewarmed resource inventory is unavailable.');
    return {items:page.items,cursor:next};
  }

  private deleteResource(path:string,uid:string,signal?:AbortSignal){
    return this.api('DELETE',path,{apiVersion:'v1',kind:'DeleteOptions',propagationPolicy:'Foreground',preconditions:{uid}},signal);
  }

  async reconcile(){
    // Keep the last configured pool clean even after the feature has been disabled.
    const [slots]=await this.pool.execute<Slot[]>(`SELECT *,
      idle_expires_at>UTC_TIMESTAMP(3) AS idle_live FROM kubernetes_prewarm_slots WHERE execution_id IS NULL`);
    const results=await Promise.allSettled(languages.map(async language=>{
      const slot=slots.find(row=>row.language===language);
      if(slot)await this.reconcileSlot(slot);
      else if(this.enabled)await this.provision(language);
    }));
    await this.removeExpiredOrphans();
    if(results.some(result=>result.status==='rejected'))throw new Error('Prewarmed pool reconciliation failed.');
  }

  private async removeExpiredOrphans(){
    const path=this.core+'/pods?limit=12&labelSelector='+encodeURIComponent(prewarmLabel);
    const signal=AbortSignal.timeout(15_000);
    try{
      for(let page=0;page<4;page++){
        const {items,cursor}=await this.listPage(path,this.orphanCursor,signal);
        for(const pod of items){
          signal.throwIfAborted();
          await this.removeExpiredOrphan(pod,signal);
        }
        this.orphanCursor=cursor;
        if(!cursor)return;
      }
      // Continue large inventories on the next periodic pass.
    }catch(error){
      this.orphanCursor='';
      throw error;
    }
  }

  private async removeExpiredOrphan(pod:any,signal:AbortSignal){
    const name=pod.metadata?.name;
    const uid=pod.metadata?.uid;
    const language=pod.metadata?.labels?.[prewarmLabel];
    const createdAt=Date.parse(pod.metadata?.creationTimestamp);
    if(typeof name!=='string'||!/^omni-warm-[a-f0-9-]{36}$/.test(name)||typeof uid!=='string'||!uid||
      !languages.includes(language)||pod.metadata.deletionTimestamp||
      !(Date.now()-createdAt>=(prewarmLifetimeSeconds+prewarmIdleSeconds)*1000))return;
    const startedAsPoolRunner=pod.spec?.containers?.[0]?.command?.slice(3,7).join(' ')===
      'apps/coordinator/src/compiler-job.ts --prewarmed '+language+' '+name;
    if(!startedAsPoolRunner)return;
    // Recheck the reservation rather than depending on the pool snapshot.
    const [[slot]]=await this.pool.execute<Slot[]>('SELECT pod_name FROM kubernetes_prewarm_slots WHERE pod_name=?',[name]);
    if(!slot)await this.deleteResource(this.podPath(name),uid,signal);
  }

  private async reconcileSlot(slot:Slot){
    if(slot.state==='RETIRING'){await this.remove(slot);return;}
    // A reserved name may still be in an in-flight create request from another broker.
    if(slot.state==='PROVISIONING'&&slot.idle_live){
      if(this.enabled&&slot.image===this.images[slot.language]&&slot.runtime_class===this.runtime){
        const pod=await this.api('GET',this.podPath(slot.pod_name));
        if(this.matches(slot,pod)&&!pod.metadata.deletionTimestamp)await this.markIdle(slot,pod.metadata.uid);
      }
      return;
    }
    if(slot.state==='IDLE'&&slot.idle_live&&this.enabled&&
      slot.image===this.images[slot.language]&&slot.runtime_class===this.runtime){
      const pod=await this.api('GET',this.podPath(slot.pod_name));
      if(this.matches(slot,pod)&&!pod.metadata.deletionTimestamp&&!['Failed','Succeeded'].includes(pod.status?.phase))return;
    }
    const [retired]=await this.pool.execute<ResultSetHeader>(`UPDATE kubernetes_prewarm_slots SET state='RETIRING'
      WHERE language=? AND pod_name=? AND state=? AND execution_id IS NULL`,[slot.language,slot.pod_name,slot.state]);
    if(retired.affectedRows===1)await this.remove({...slot,state:'RETIRING'});
  }

  private async provision(language:Language){
    const createBudget=AbortSignal.timeout(12_000);
    const name='omni-warm-'+randomUUID();
    const image=this.images[language];
    const manifest=prewarmedManifest(name,language,image,this.runtime);
    try{
      await this.pool.execute(`INSERT INTO kubernetes_prewarm_slots
        (language,pod_name,image,runtime_class,state,idle_expires_at,expires_at)
        VALUES (?,?,?,?,'PROVISIONING',TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)),TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)))`,
      [language,name,image,this.runtime,prewarmIdleSeconds,prewarmLifetimeSeconds]);
    }catch(error){
      if((error as {code?:string}).code==='ER_DUP_ENTRY')return;
      throw error;
    }
    const slot={language,pod_name:name,pod_uid:null,image,runtime_class:this.runtime} as Slot;
    createBudget.throwIfAborted();
    const created=await this.api('POST',this.core+'/pods',manifest,createBudget);
    if(!this.matches(slot,created))throw new Error('Prewarmed Pod creation could not be confirmed.');
    await this.markIdle(slot,created.metadata.uid);
  }

  private async markIdle(slot:Slot,uid:string){
    await this.pool.execute(`UPDATE kubernetes_prewarm_slots SET state='IDLE',pod_uid=?
      WHERE language=? AND pod_name=? AND state='PROVISIONING' AND idle_expires_at>UTC_TIMESTAMP(3)`,
    [uid,slot.language,slot.pod_name]);
  }
}
