package org.omnicompile.worker

import java.net.URI

/** Only the authenticated HTTPS coordinator may advertise a direct TLS transport. */
object WorkerEndpoint {
    fun localEndpoint(origin:String):String? {
        val uri=URI(origin)
        require(uri.userInfo==null && uri.host!=null && uri.rawQuery==null && uri.fragment==null)
        if(uri.scheme=="https")return null
        val host=uri.host
        val local=host in setOf("localhost","127.0.0.1","[::1]","::1") || host.startsWith("10.") || host.startsWith("192.168.") || Regex("^172\\.(1[6-9]|2\\d|3[01])\\.").containsMatchIn(host)
        require(uri.scheme=="http" && local) { "Insecure public coordinator is not permitted." }
        return "ws://${uri.rawAuthority}/ws/worker"
    }
    fun validate(value:String):String {
        val uri=URI(value)
        require(uri.scheme=="wss" && uri.host!=null && uri.userInfo==null && uri.rawQuery==null && uri.fragment==null && uri.rawPath=="/ws/worker") { "Unsafe worker transport." }
        return uri.toASCIIString()
    }
}
