package org.omnicompile.worker

import android.content.Context
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.serialization.json.*
import java.time.Instant
import java.util.UUID

data class WorkerUiState(val connection:ConnectionState=ConnectionState(),val networkName:String="",val hasEnrollment:Boolean=false,val pending:Boolean=false,val error:String="",val summary:JsonObject?=null,val resources:JsonObject?=null,val logs:List<String> = emptyList(),val policy:ContributionPolicy=ContributionPolicy())

/** One process-local owner. Recreating a process never silently resumes contribution. */
object AndroidRuntime {
    val state=MutableStateFlow(WorkerUiState())
    private val scope=CoroutineScope(SupervisorJob()+Dispatchers.IO)
    private lateinit var store:IdentityStore
    lateinit var device:DeviceResources; private set
    private var initialized=false
    private var identity:JsonObject?=null
    private var pendingRotation:JsonObject?=null
    private var connection:WorkerConnection?=null
    private var statistics:Job?=null
    private var inspected:Invitation?=null
    private var inspectedName=""
    private val transactions=IdentityTransactions()
    private var visibleActivities=0
    @Synchronized fun enteredForeground(){visibleActivities++;device.foreground=true}
    @Synchronized fun exitedForeground(){visibleActivities=(visibleActivities-1).coerceAtLeast(0);device.foreground=visibleActivities>0}
    @Synchronized fun initialize(context:Context) {
        if(initialized)return
        initialized=true;store=IdentityStore(context.applicationContext);device=DeviceResources(context.applicationContext)
        try {
            identity=store.load()
            val saved=identity?.get("policy")?.jsonObject
            val policy=if(saved!=null)ContributionPolicy(wifiOnly=saved["wifiOnly"]!!.jsonPrimitive.boolean,chargingOnly=saved["chargingOnly"]!!.jsonPrimitive.boolean,minBattery=saved["minBattery"]!!.jsonPrimitive.int,allowMetered=saved["allowMetered"]!!.jsonPrimitive.boolean,allowBackground=saved["allowBackground"]!!.jsonPrimitive.boolean,thermalProtection=saved["thermalProtection"]!!.jsonPrimitive.boolean,maxTaskDurationMs=saved["maxTaskDurationMs"]!!.jsonPrimitive.long,maxMemoryBytes=saved["maxMemoryBytes"]!!.jsonPrimitive.long,maxCpuPercent=saved["maxCpuPercent"]!!.jsonPrimitive.int)else ContributionPolicy()
            state.value=WorkerUiState(hasEnrollment=identity?.get("credential")!=null,networkName=identity?.get("networkName")?.jsonPrimitive?.content?:"",policy=policy)
        } catch(_:Exception){state.update{it.copy(error="Protected configuration cannot be read. Preserve it and revoke the old enrollment through the administrator.")}}
    }
    private fun record(message:String){state.update{it.copy(logs=(it.logs+"${Instant.now()} $message").takeLast(100))}}
    private suspend fun operation(work: suspend ()->Unit) {
        transactions.run {
            state.update{it.copy(pending=true,error="")}
            try {work()}catch(_:Exception){state.update{it.copy(error=if(pendingRotation!=null)"Credential changed at the coordinator but protected saving failed. Retry credential rotation before closing. Contribution remains stopped. If the app closes, ask the administrator to revoke this enrollment and join again." else "Request failed. Check coordinator availability and the network link. Existing enrollment is preserved.")};record("Requested operation failed; contribution state requires review.")}
            finally {state.update{it.copy(pending=false)}}
        }
    }
    suspend fun inspect(link:String)=withContext(Dispatchers.IO){operation {
        inspected=null
        val invitation=Invitation.parse(link,BuildConfig.DEBUG)
        val network=CoordinatorApi(invitation.origin).inspect(invitation.token)
        inspected=invitation;inspectedName=network["name"]!!.jsonPrimitive.content
        state.update{it.copy(networkName=inspectedName)};record("Network inspected. Awaiting explicit consent.")
    }}
    fun hasInspectedNetwork()=inspected!=null
    fun invalidateInspection(){inspected=null;if(!state.value.hasEnrollment)state.update{it.copy(networkName="")}}
    fun settingsError(){state.update{it.copy(error="Settings could not be saved. Protected enrollment has not been reset.")}}
    suspend fun enroll(consent:Boolean)=withContext(Dispatchers.IO){operation {
        require(consent&&!state.value.hasEnrollment)
        val invitation=inspected?:error("Inspect a network first.")
        val deviceId=identity?.get("deviceIdentity")?.jsonPrimitive?.content?:UUID.randomUUID().toString()
        // Save identity before admission so interrupted admission never changes device identity.
        val base=buildJsonObject{put("deviceIdentity",deviceId);put("policy",policyJson(state.value.policy))};store.save(base);identity=base
        val enrolled=CoordinatorApi(invitation.origin).enroll(invitation.token,deviceId,true)
        val updated=buildJsonObject {base.forEach{(k,v)->put(k,v)};put("origin",invitation.origin);put("credential",enrolled["workerCredential"]!!);put("networkId",enrolled["networkId"]!!);put("networkName",inspectedName)}
        val scoped=JsonObject(updated+("enrollmentId" to (enrolled["enrollmentId"]?:error("Missing enrollment identity."))))
        store.save(scoped);identity=scoped;state.update{it.copy(hasEnrollment=true,connection=ConnectionState(status="ENROLLED"))};record("Explicit enrollment accepted. Ready to connect.")
    }}
    @Synchronized fun start() {
        if(pendingRotation!=null){state.update{it.copy(error="Retry credential rotation to save the replacement before reconnecting.")};return}
        if(connection!=null)return
        val enrollment=identity?:return;val credential=enrollment["credential"]?.jsonPrimitive?.content?:return
        val origin=enrollment["origin"]!!.jsonPrimitive.content
        val policy=state.value.policy
        connection=WorkerConnection(origin,credential,{device.profile(policy)},{device.snapshot().also{sample->state.update{it.copy(resources=sample)}}},{device.blockReason(policy)},policy){status->state.update{it.copy(connection=status)}}
        connection!!.start();record("Contribution explicitly activated.")
        statistics=scope.launch { while(isActive) {delay(5000);try {val summary=CoordinatorApi(origin).status(credential);if(identity?.get("credential")?.jsonPrimitive?.content==credential)state.update{it.copy(summary=summary)}}catch(_:Exception){state.update{it.copy(summary=null)}}} }
    }
    @Synchronized fun stop(status:String="DISCONNECTED") {
        statistics?.cancel();statistics=null
        connection?.close();connection=null
        state.update{it.copy(connection=it.connection.copy(status=status,currentTask=null))};record("Contribution $status.")
    }
    suspend fun leave()=withContext(Dispatchers.IO){operation {
        check(pendingRotation==null){"Retry credential rotation before leaving."}
        stop()
        val enrolled=identity?:return@operation
        val credential=enrolled["credential"]?.jsonPrimitive?.content?:return@operation
        CoordinatorApi(enrolled["origin"]!!.jsonPrimitive.content).leave(credential)
        val clean=buildJsonObject{put("deviceIdentity",enrolled["deviceIdentity"]!!);put("policy",policyJson(state.value.policy))}
        store.save(clean);identity=clean;inspected=null
        state.update{it.copy(hasEnrollment=false,networkName="",summary=null,connection=ConnectionState(status="LEFT"))};record("Enrollment revoked; network left.")
    }}
    suspend fun savePolicy(policy:ContributionPolicy)=withContext(Dispatchers.IO){operation {
        check(pendingRotation==null){"Retry credential rotation before changing settings."}
        stop("PAUSED")
        val updated=JsonObject((identity?:buildJsonObject{put("deviceIdentity",UUID.randomUUID().toString())})+("policy" to policyJson(policy)))
        store.save(updated);identity=updated;state.update{it.copy(policy=policy)};record("Contribution settings saved. Resume explicitly.")
    }}
    suspend fun rotateCredential()=withContext(Dispatchers.IO){operation {
        stop("PAUSED")
        val enrolled=identity?:error("No active enrollment.")
        if(pendingRotation==null){val replacement=CoordinatorApi(enrolled["origin"]!!.jsonPrimitive.content).rotate(enrolled["credential"]!!.jsonPrimitive.content);pendingRotation=JsonObject(enrolled+("credential" to JsonPrimitive(replacement)))}
        val updated=pendingRotation!!;store.save(updated);identity=updated;pendingRotation=null
        state.update{it.copy(connection=it.connection.copy(status="PAUSED",error=""))};record("Credential rotated and protected. Resume contribution explicitly.")
    }}
    suspend fun importCredential(credential:String,enrollmentId:String)=withContext(Dispatchers.IO){operation {
        check(pendingRotation==null);require(credential.length in 20..2048&&enrollmentId.isNotBlank())
        stop("PAUSED")
        val enrolled=identity?:error("No active enrollment.")
        val replacement=CoordinatorApi(enrolled["origin"]!!.jsonPrimitive.content).enrollmentStatus(credential)
        validateReplacementScope(replacement,enrolled["networkId"]!!.jsonPrimitive.content,enrollmentId,state.value.connection.nodeId,enrolled["enrollmentId"]?.jsonPrimitive?.content)
        val updated=JsonObject(enrolled+mapOf("credential" to JsonPrimitive(credential),"enrollmentId" to JsonPrimitive(enrollmentId)))
        store.save(updated);identity=updated;record("Administrator replacement verified and protected. Resume contribution explicitly.")
    }}
    private fun policyJson(p:ContributionPolicy)=buildJsonObject{put("wifiOnly",p.wifiOnly);put("chargingOnly",p.chargingOnly);put("minBattery",p.minBattery);put("allowMetered",p.allowMetered);put("allowBackground",p.allowBackground);put("thermalProtection",p.thermalProtection);put("maxTaskDurationMs",p.maxTaskDurationMs);put("maxMemoryBytes",p.maxMemoryBytes);put("maxCpuPercent",p.maxCpuPercent)}
}
