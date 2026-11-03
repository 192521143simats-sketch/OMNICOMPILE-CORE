package org.omnicompile.worker
import kotlinx.serialization.json.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class CoordinatorApi(private val origin:String) {
    private val client=OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).connectTimeout(10,TimeUnit.SECONDS).readTimeout(15,TimeUnit.SECONDS).callTimeout(20,TimeUnit.SECONDS).build()
    private fun request(path:String,body:JsonObject?=null,credential:String?=null,leaving:Boolean=false):JsonObject {
        val builder=Request.Builder().url(origin+path)
        if(credential!=null){require(credential.length in 1..2048);builder.header("Authorization","Bearer $credential")}
        if(body!=null)builder.post(body.toString().toRequestBody("application/json".toMediaType()))
        client.newCall(builder.build()).execute().use { response ->
            if(leaving&&(response.code==204||response.code==401))return buildJsonObject{}
            require(response.isSuccessful) { when(response.code){404,410->"This network link has expired or admission is closed.";401,403->"Worker enrollment is unavailable or revoked.";429->"Too many requests. Please wait before retrying.";else->"Coordinator request failed. Your enrollment has been preserved."} }
            val source=response.body?.source()?:throw IllegalArgumentException("Empty coordinator response.")
            source.request(1_000_001);require(source.buffer.size<=1_000_000) { "Coordinator response exceeds limit." }
            return Json.parseToJsonElement(source.readUtf8()).jsonObject
        }
    }
    fun inspect(token:String):JsonObject { require(token.matches(Regex("[A-Za-z0-9_-]{16,256}"))); return request("/api/join/$token")["network"]!!.jsonObject }
    fun enroll(token:String,deviceIdentity:String,consent:Boolean):JsonObject {
        require(consent) { "Explicit contribution consent is required." }
        require(token.matches(Regex("[A-Za-z0-9_-]{16,256}"))&&deviceIdentity.length in 8..300)
        val result=request("/api/join/$token/accept",buildJsonObject {put("workerType","ANDROID");put("deviceIdentity",deviceIdentity);put("consent",true)})
        require(result["workerCredential"]?.jsonPrimitive?.content?.length in 20..2048 && result["networkId"]?.jsonPrimitive?.content?.length in 1..64) { "Invalid enrollment response." }
        return result
    }
    fun status(credential:String)=request("/api/worker/status",credential=credential)
    fun enrollmentStatus(credential:String)=request("/api/enrollments/status",credential=credential)
    fun rotate(credential:String):String {
        val replacement=request("/api/worker/rotate-credential",buildJsonObject{},credential)["workerCredential"]?.jsonPrimitive?.content
        require(replacement!=null&&replacement.length in 20..2048){"Invalid replacement credential response."}
        return replacement
    }
    fun leave(credential:String) { request("/api/worker/leave",buildJsonObject{},credential,true) }
}
