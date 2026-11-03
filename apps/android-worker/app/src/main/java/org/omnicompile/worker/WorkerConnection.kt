package org.omnicompile.worker

import kotlinx.serialization.json.*
import okhttp3.*
import java.time.Instant
import java.util.concurrent.*
import java.util.concurrent.atomic.AtomicBoolean

class WorkerConnection(
    private val origin:String, private val credential:String,
    private val profile:()->JsonObject, private val resources:()->JsonObject,
    private val blocked:()->String?, private val policy:ContributionPolicy=ContributionPolicy(), private val onState:(ConnectionState)->Unit
) {
    private val transport=Executors.newSingleThreadScheduledExecutor()
    private val compute=Executors.newSingleThreadExecutor()
    private val http=OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).connectTimeout(10,TimeUnit.SECONDS).readTimeout(0,TimeUnit.SECONDS).build()
    private var socket:WebSocket?=null
    private var desired=false
    private var generation=0L
    private var failures=0
    private var state=ConnectionState()
    private var beat:ScheduledFuture<*>?=null
    private var registration:ScheduledFuture<*>?=null
    private var retry:ScheduledFuture<*>?=null
    private var active:Active?=null
    private data class Active(val id:String,val attempt:Int,val cancelled:AtomicBoolean=AtomicBoolean(false))
    private fun update(change:ConnectionState) { state=change; onState(state) }
    private fun send(ws:WebSocket,type:String,body:JsonObject=buildJsonObject{}) {
        if(socket!==ws)return
        check(ws.send(buildJsonObject { put("protocolVersion",2); put("type",type); body.forEach{(key,value)->put(key,value)} }.toString())) { "Connection unavailable." }
    }
    fun start() { transport.execute { if(!desired) { desired=true; connect() } } }
    fun stop() {
        if(transport.isShutdown)return
        transport.submit { desired=false; generation++; retry?.cancel(false); retry=null; release(); update(state.copy(status="DISCONNECTED",currentTask=null)) }.get(5,TimeUnit.SECONDS)
    }
    fun close() { stop(); transport.shutdownNow(); compute.shutdownNow(); http.dispatcher.executorService.shutdown(); http.connectionPool.evictAll() }
    private fun release() {
        beat?.cancel(false); beat=null; registration?.cancel(false); registration=null
        active?.cancelled?.set(true); active=null
        val old=socket; socket=null
        old?.send("""{"protocolVersion":2,"type":"disconnect"}"""); old?.close(1000,"Contribution stopped")
    }
    private fun connect() {
        if(!desired)return
        val block=blocked()
        if(block!=null) { update(state.copy(status="POLICY_PAUSED",error=block)); retry=transport.schedule({connect()},5,TimeUnit.SECONDS); return }
        val epoch=++generation
        update(state.copy(status="CONNECTING",error=""))
        val endpoint=origin.replaceFirst(Regex("^http"),"ws")+"/ws/worker"
        socket=http.newWebSocket(Request.Builder().url(endpoint).header("Authorization","Bearer $credential").build(),object:WebSocketListener() {
            override fun onOpen(ws:WebSocket,response:Response) { enqueue { if(epoch==generation&&desired)send(ws,"register",buildJsonObject { put("profile",profile()) }) } }
            override fun onMessage(ws:WebSocket,text:String) { enqueue {
                if(epoch!=generation||socket!==ws||!desired)return@enqueue
                try { receive(ws,text) } catch(_:Exception) { update(state.copy(error="Coordinator sent an invalid or incompatible message.")); ws.close(1008,"Protocol rejected"); desired=false; release(); update(state.copy(status="ERROR",currentTask=null)) }
            } }
            override fun onFailure(ws:WebSocket,t:Throwable,response:Response?) { enqueue { lost(ws,epoch,false) } }
            override fun onClosing(ws:WebSocket,code:Int,reason:String) { ws.close(code,null); enqueue { lost(ws,epoch,code==1008||code==1012&&reason=="Reconnected elsewhere") } }
            override fun onClosed(ws:WebSocket,code:Int,reason:String) { enqueue { lost(ws,epoch,code==1008||code==1012&&reason=="Reconnected elsewhere") } }
        })
        registration=transport.schedule({if(epoch==generation&&state.status=="CONNECTING")socket?.cancel()},15,TimeUnit.SECONDS)
    }
    private fun enqueue(work:()->Unit) { if(!transport.isShutdown)try {transport.execute(work)}catch(_:RejectedExecutionException){} }
    private fun lost(ws:WebSocket,epoch:Long,fatal:Boolean) {
        if(socket!==ws||epoch!=generation)return
        release(); generation++
        if(fatal) { desired=false; update(state.copy(status="REVOKED",currentTask=null,error="Enrollment revoked, expired, or connected elsewhere. Explicit action is required.")); return }
        if(desired) { update(state.copy(status="RECONNECTING",currentTask=null,error="Coordinator unavailable; retrying with backoff.")); val delay=(1000L shl failures.coerceAtMost(5)).coerceAtMost(30000); failures++; retry=transport.schedule({connect()},delay,TimeUnit.MILLISECONDS) }
    }
    private fun receive(ws:WebSocket,text:String) {
        require(text.length<=2_000_000)
        val message=Json.parseToJsonElement(text).jsonObject
        val version=message["protocolVersion"] as? JsonPrimitive
        require(version?.isString==false&&version.intOrNull==2)
        when(message["type"]?.jsonPrimitive?.content) {
            "registered" -> {
                val node=message["nodeId"]!!.jsonPrimitive.content; require(node.length in 1..64)
                val heartbeat=message["heartbeatIntervalMs"]!!.jsonPrimitive;require(!heartbeat.isString)
                val interval=heartbeat.long; require(interval in 1000..60000)
                registration?.cancel(false); failures=0
                update(state.copy(status="AVAILABLE",nodeId=node,currentTask=null,error=""))
                beat?.cancel(false)
                // Android may suspend cached processes. Delay from completion
                // rather than replaying missed heartbeat intervals in a burst.
                beat=transport.scheduleWithFixedDelay({
                    if(socket!==ws)return@scheduleWithFixedDelay
                    try {
                        val reason=blocked()
                        if(reason!=null) { release(); generation++; update(state.copy(status="POLICY_PAUSED",currentTask=null,error=reason)); retry=transport.schedule({connect()},5,TimeUnit.SECONDS); return@scheduleWithFixedDelay }
                        val snapshot=resources(); send(ws,"heartbeat",buildJsonObject{put("resources",snapshot)})
                        update(state.copy(lastHeartbeat=Instant.now().toString()))
                    } catch(_:Exception) { ws.cancel() }
                },0,interval,TimeUnit.MILLISECONDS)
            }
            "task_assignment" -> {
                require(state.nodeId.isNotEmpty())
                val id=message["taskId"]!!.jsonPrimitive.content; val rawAttempt=message["attempt"]!!.jsonPrimitive;require(!rawAttempt.isString);val attempt=rawAttempt.int
                require(id.length in 1..64 && attempt>0)
                val kind=message["taskKind"]!!.jsonPrimitive.content
                val payload=message["payload"]!!.jsonObject
                require(kind=="TEST_COMPUTE"&&payload["operation"]?.jsonPrimitive?.content in setOf("sha256","prime_count","sha256_chain","matrix_multiply","portable_benchmark") || kind=="C_OPTIMIZE_IR"&&payload["operation"]?.jsonPrimitive?.content=="c_optimize_ir") { "Unsupported Android task kind or operation." }
                require(active==null) { "Only one active task is permitted." }
                require(blocked()==null)
                val work=Active(id,attempt); active=work; val epoch=generation
                update(state.copy(status="BUSY",currentTask=id))
                send(ws,"task_state",buildJsonObject{put("taskId",id);put("attempt",attempt);put("status","RUNNING")})
                compute.execute {
                    val started=System.nanoTime()
                    try {
                        require(payload.toString().toByteArray(Charsets.UTF_8).size*8L<=policy.maxMemoryBytes) { "Task input exceeds working-memory budget." }
                        val result=PortableExecutor.execute(payload,maxDurationMs=policy.maxTaskDurationMs,cancelled={work.cancelled.get()},cpuPercent=policy.maxCpuPercent)
                        enqueue {
                            if(epoch==generation&&socket===ws&&desired&&active===work&&!work.cancelled.get()&&blocked()==null) {
                                send(ws,"task_result",buildJsonObject {put("taskId",id);put("attempt",attempt);put("result",result);put("executionTimeMs",(System.nanoTime()-started)/1_000_000.0);put("resources",resources())})
                            }
                            if(active===work){active=null;update(state.copy(status="AVAILABLE",currentTask=null))}
                        }
                    } catch(_:Exception) { enqueue {
                        if(epoch==generation&&socket===ws&&desired&&active===work)send(ws,"task_state",buildJsonObject{put("taskId",id);put("attempt",attempt);put("status","FAILED");put("error","Task cancelled, invalid, or exceeded the portable execution limit.")})
                        if(active===work){active=null;update(state.copy(status="AVAILABLE",currentTask=null))}
                    } }
                }
            }
            "task_cancel" -> { val task=active; if(task!=null&&task.id==message["taskId"]?.jsonPrimitive?.content&&task.attempt==message["attempt"]?.jsonPrimitive?.intOrNull) task.cancelled.set(true) }
            "error" -> { if(message["code"]?.jsonPrimitive?.content=="WORKER_APPROVAL_PENDING")update(state.copy(status="PENDING_APPROVAL",error="Waiting for administrator approval. No work is accepted while pending.")) else update(state.copy(error="Coordinator rejected the request; inspect scoped dashboard diagnostics.")) }
            else -> throw IllegalArgumentException("Unknown protocol message.")
        }
    }
}
data class ConnectionState(val status:String="DISCONNECTED",val nodeId:String="",val currentTask:String?=null,val lastHeartbeat:String?=null,val error:String="")
