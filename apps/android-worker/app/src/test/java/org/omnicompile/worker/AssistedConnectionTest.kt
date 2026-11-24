package org.omnicompile.worker

import kotlinx.serialization.json.*
import okhttp3.*
import okhttp3.mockwebserver.*
import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class AssistedConnectionTest {
    @Test fun leasedCompilerAssignmentUsesToolHttpAndReturnsResultOnDeviceSocket() {
        val server=MockWebServer();val completed=CountDownLatch(1);val result=AtomicReference<JsonObject>();val requested=AtomicReference<JsonObject>()
        server.dispatcher=object:okhttp3.mockwebserver.Dispatcher(){
            override fun dispatch(request:RecordedRequest):MockResponse {
                if(request.path=="/api/worker/compiler"){
                    assertEquals("Bearer test-device-credential",request.getHeader("Authorization"))
                    requested.set(Json.parseToJsonElement(request.body.readUtf8()).jsonObject)
                    return MockResponse().setBody("""{"result":{"operation":"java_compile"},"assistance":{"method":"server-assisted compilation"}}""")
                }
                return MockResponse().withWebSocketUpgrade(object:WebSocketListener(){
                    override fun onMessage(webSocket:WebSocket,text:String){
                        val message=Json.parseToJsonElement(text).jsonObject
                        when(message["type"]?.jsonPrimitive?.content){
                            "register"->{
                                webSocket.send("""{"protocolVersion":2,"type":"registered","nodeId":"NODE-A001","heartbeatIntervalMs":1000}""")
                                webSocket.send("""{"protocolVersion":2,"type":"task_assignment","taskId":"TASK-compile","attempt":2,"taskKind":"JAVA_COMPILE","payload":{"operation":"java_compile","source":"class Main {}","sourceName":"Main.java"}}""")
                            }
                            "task_result"->{result.set(message);completed.countDown()}
                        }
                    }
                    override fun onClosing(webSocket:WebSocket,code:Int,reason:String){webSocket.close(code,null)}
                })
            }
        }
        server.start()
        val connection=WorkerConnection(server.url("/").newBuilder().host("127.0.0.1").build().toString().trimEnd('/'),"test-device-credential",{buildJsonObject{put("operations",buildJsonObject{put("serverAssistedCompilation",true);put("nativeCompilation",false)})}},{buildJsonObject{}},{null}){}
        try{
            connection.start();assertTrue(completed.await(10,TimeUnit.SECONDS))
            assertEquals(setOf("taskId","attempt"),requested.get().keys)
            assertEquals("TASK-compile",result.get()["taskId"]!!.jsonPrimitive.content)
            assertEquals("java_compile",result.get()["result"]!!.jsonObject["operation"]!!.jsonPrimitive.content)
        }finally{connection.close();server.shutdown()}
    }
}
