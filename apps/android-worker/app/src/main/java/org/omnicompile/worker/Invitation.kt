package org.omnicompile.worker

import java.net.URI

data class Invitation(val origin: String, val token: String) {
    companion object {
        fun parse(input: String, debug: Boolean): Invitation {
            require(input.length in 1..2048) { "Enter a valid network join link." }
            val url = try { URI(input.trim()) } catch (_: Exception) { throw IllegalArgumentException("Invalid network join link.") }
            require(url.scheme == "https" || debug && url.scheme == "http") { "A secure HTTPS coordinator is required." }
            require(url.host != null && url.rawUserInfo == null && url.rawQuery == null && url.rawFragment == null) { "Join links must not contain credentials, queries or fragments." }
            val match = Regex("^/join/([A-Za-z0-9_-]{16,256})$").matchEntire(url.rawPath ?: "")
            require(match != null) { "Use the network's /join/ link." }
            return Invitation(URI(url.scheme, null, url.host, url.port, null, null, null).toString(), match.groupValues[1])
        }
    }
}
