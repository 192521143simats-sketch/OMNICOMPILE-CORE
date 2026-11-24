package org.omnicompile.worker

import kotlinx.serialization.json.*
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.*
import org.junit.Test

class CompilerToolClientTest {
    @Test fun sendsOnlyLeasedIdentityAndPreservesCompilerDiagnostics() {
        val server=MockWebServer()
        server.enqueue(MockResponse().setBody("""{"result":{"operation":"java_compile"},"assistance":{"method":"server-assisted compilation"}}"""))
        server.enqueue(MockResponse().setResponseCode(422).setBody("""{"error":{"message":"invalid source","diagnostics":[{"severity":"error","message":"missing symbol","line":4,"column":2}]}}"""))
        server.start()
        try {
            val http=OkHttpClient();val origin=server.url("/").toString().trimEnd('/')
            assertEquals("java_compile",CompilerToolClient.compile(http,origin,"test-credential","TASK-1",2){}.jsonObject["operation"]!!.jsonPrimitive.content)
            val request=server.takeRequest();assertEquals("/api/worker/compiler",request.path);assertEquals("Bearer test-credential",request.getHeader("Authorization"))
            assertEquals(setOf("taskId","attempt"),Json.parseToJsonElement(request.body.readUtf8()).jsonObject.keys)
            try{CompilerToolClient.compile(http,origin,"test-credential","TASK-2",1){};fail("Expected diagnostic failure")}
            catch(error:CompilerToolException){assertEquals(4,error.diagnostics!![0].jsonObject["line"]!!.jsonPrimitive.int)}
        }finally{server.shutdown()}
    }
}
