package org.omnicompile.worker

import kotlinx.serialization.json.*
import okhttp3.*
import okhttp3.mockwebserver.*
import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class WorkerConnectionTest {
    @Test fun delayedTelemetryDoesNotReplayMissedHeartbeatsInABurst() {
        val sampling=CountDownLatch(1);val resume=CountDownLatch(1);val beats=CountDownLatch(2)
        val first=java.util.concurrent.atomic.AtomicBoolean(true)
        val times=java.util.concurrent.ConcurrentLinkedQueue<Long>();val server=MockWebServer()
        server.enqueue(MockResponse().withWebSocketUpgrade(object:WebSocketListener(){
            override fun onMessage(webSocket:WebSocket,text:String){
                when(Json.parseToJsonElement(text).jsonObject["type"]?.jsonPrimitive?.content){
                    "register"->webSocket.send("""{"protocolVersion":2,"type":"registered","nodeId":"NODE-A001","heartbeatIntervalMs":1000}""")
                    "heartbeat"->{times.add(System.nanoTime());beats.countDown()}
                }
            }
            override fun onClosing(webSocket:WebSocket,code:Int,reason:String){webSocket.close(code,null)}
        }))
        val connection=WorkerConnection(server.url("/").toString().trimEnd('/'),"test-token",{buildJsonObject{}},{
            if(first.compareAndSet(true,false)){sampling.countDown();check(resume.await(5,TimeUnit.SECONDS))}
            buildJsonObject{}
        },{null}){}
        try{
            connection.start();assertTrue(sampling.await(5,TimeUnit.SECONDS))
            // Deliberately miss two intervals while sampling is blocked. This
            // models scheduler backlog, not a claimed physical-device suspend.
            Thread.sleep(2200);resume.countDown();assertTrue(beats.await(5,TimeUnit.SECONDS))
            val arrivals=times.toList();assertTrue("Heartbeats must remain spaced after a delay",TimeUnit.NANOSECONDS.toMillis(arrivals[1]-arrivals[0])>=750)
        }finally{resume.countDown();connection.close();server.shutdown()}
    }
    @Test fun taskCancellationCloseReconnectsWithoutRevokingEnrollment() {
        val available=CountDownLatch(2);val server=MockWebServer();var revoked=false
        fun peer(cancel:Boolean)=object:WebSocketListener(){
            override fun onMessage(webSocket:WebSocket,text:String){
                if(Json.parseToJsonElement(text).jsonObject["type"]?.jsonPrimitive?.content!="register")return
                webSocket.send("""{"protocolVersion":2,"type":"registered","nodeId":"NODE-A001","heartbeatIntervalMs":1000}""")
                if(cancel)webSocket.close(1012,"Task cancelled; reconnect after execution stops")
            }
            override fun onClosing(webSocket:WebSocket,code:Int,reason:String){webSocket.close(code,null)}
        }
        server.enqueue(MockResponse().withWebSocketUpgrade(peer(true)));server.enqueue(MockResponse().withWebSocketUpgrade(peer(false)))
        val connection=WorkerConnection(server.url("/").toString().trimEnd('/'),"test-token",{buildJsonObject{}},{buildJsonObject{}},{null}){if(it.status=="AVAILABLE")available.countDown();if(it.status=="REVOKED")revoked=true}
        try {connection.start();assertTrue("Cancellation must reconnect",available.await(8,TimeUnit.SECONDS));assertFalse(revoked)}finally{connection.close();server.shutdown()}
    }
    @Test fun rejectsStringProtocolVersionRatherThanCoercingIt() {
        val rejected=CountDownLatch(1);val server=MockWebServer()
        server.enqueue(MockResponse().withWebSocketUpgrade(object:WebSocketListener(){
            override fun onMessage(webSocket:WebSocket,text:String){webSocket.send("""{"protocolVersion":"2","type":"registered","nodeId":"NODE-A001","heartbeatIntervalMs":1000}""")}
            override fun onClosing(webSocket:WebSocket,code:Int,reason:String){webSocket.close(code,null)}
        }))
        val connection=WorkerConnection(server.url("/").toString().trimEnd('/'),"test-token",{buildJsonObject{}},{buildJsonObject{}},{null}) {if(it.status=="ERROR")rejected.countDown()}
        try{connection.start();assertTrue("Non-integer protocol versions must be rejected",rejected.await(5,TimeUnit.SECONDS))}finally{connection.close();server.shutdown()}
    }
    @Test fun rejectsLegacyNumericProtocolRatherThanReusingOldEnrollment() {
        val rejected=CountDownLatch(1);val server=MockWebServer()
        server.enqueue(MockResponse().withWebSocketUpgrade(object:WebSocketListener(){
            override fun onMessage(webSocket:WebSocket,text:String){webSocket.send("""{"protocolVersion":1,"type":"registered","nodeId":"NODE-A001","heartbeatIntervalMs":1000}""")}
            override fun onClosing(webSocket:WebSocket,code:Int,reason:String){webSocket.close(code,null)}
        }))
        val connection=WorkerConnection(server.url("/").toString().trimEnd('/'),"test-token",{buildJsonObject{}},{buildJsonObject{}},{null}){if(it.status=="ERROR")rejected.countDown()}
        try{connection.start();assertTrue("Legacy protocol must be rejected",rejected.await(5,TimeUnit.SECONDS))}finally{connection.close();server.shutdown()}
    }
    @Test fun authenticatesAndReturnsRealAssignedResult() {
        val complete=CountDownLatch(1); var received:JsonObject?=null; var register:JsonObject?=null
        val server=MockWebServer()
        server.enqueue(MockResponse().withWebSocketUpgrade(object:WebSocketListener() {
            override fun onClosing(webSocket:WebSocket,code:Int,reason:String) { webSocket.close(code,null) }
            override fun onMessage(ws:WebSocket,text:String) {
                val message=Json.parseToJsonElement(text).jsonObject
                if(message["type"]?.jsonPrimitive?.content=="register") {
                    register=message
                    ws.send("""{"protocolVersion":2,"type":"registered","nodeId":"NODE-A001","heartbeatIntervalMs":1000}""")
                    ws.send("""{"protocolVersion":2,"type":"task_assignment","taskId":"TASK-1","attempt":1,"taskKind":"TEST_COMPUTE","payload":{"operation":"prime_count","limit":20}}""")
                }
                if(message["type"]?.jsonPrimitive?.content=="task_result") { received=message; complete.countDown() }
            }
        }))
        val connection=WorkerConnection(server.url("/").toString().trimEnd('/'),"scoped-private-test-token",{buildJsonObject{put("workerType","ANDROID")}}, {buildJsonObject{}}, {null}) {}
        try {
            connection.start()
            assertTrue(complete.await(15,TimeUnit.SECONDS))
            assertEquals("Bearer scoped-private-test-token",server.takeRequest(2,TimeUnit.SECONDS)!!.getHeader("Authorization"))
            assertEquals(2,register!!["protocolVersion"]!!.jsonPrimitive.int)
            assertEquals(2,received!!["protocolVersion"]!!.jsonPrimitive.int)
            assertEquals(8,received!!["result"]!!.jsonObject["count"]!!.jsonPrimitive.int)
            assertEquals("TASK-1",received!!["taskId"]!!.jsonPrimitive.content)
        } finally { connection.close(); server.shutdown() }
    }
}
