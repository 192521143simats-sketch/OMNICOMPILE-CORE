package org.omnicompile.worker

import kotlinx.serialization.json.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream
import java.util.concurrent.TimeUnit

class CompilerToolException(message:String,val diagnostics:JsonArray?=null):Exception(message)

/** Only requests the device's leased task, never arbitrary source or shell commands. */
object CompilerToolClient {
    fun compile(http:OkHttpClient,origin:String,credential:String,taskId:String,attempt:Int,onCall:(Call)->Unit):JsonElement {
        val payload=buildJsonObject{put("taskId",taskId);put("attempt",attempt)}
        val call=http.newBuilder().readTimeout(35,TimeUnit.SECONDS).callTimeout(35,TimeUnit.SECONDS).build().newCall(
            Request.Builder().url(origin.trimEnd('/')+"/api/worker/compiler").header("Authorization","Bearer $credential")
                .header("ngrok-skip-browser-warning","1").post(payload.toString().toRequestBody("application/json".toMediaType())).build())
        onCall(call)
        return call.execute().use { response ->
            val body=response.body?:throw CompilerToolException("Compiler tool returned an empty response")
            require(body.contentLength()<=32_000_000) { "Compiler tool response exceeds transfer budget" }
            val bytes=ByteArrayOutputStream()
            body.byteStream().use { stream ->
                val buffer=ByteArray(8192)
                while(true){val count=stream.read(buffer);if(count<0)break;require(bytes.size()+count<=32_000_000);bytes.write(buffer,0,count)}
            }
            val value=Json.parseToJsonElement(bytes.toString("UTF-8")).jsonObject
            if(!response.isSuccessful){val error=value["error"]?.jsonObject;throw CompilerToolException(error?.get("message")?.jsonPrimitive?.content?:"Compiler tool unavailable",error?.get("diagnostics") as? JsonArray)}
            require(value["assistance"]?.jsonObject?.get("method")?.jsonPrimitive?.content=="server-assisted compilation")
            value["result"]?:throw CompilerToolException("Compiler tool result missing")
        }
    }
}
