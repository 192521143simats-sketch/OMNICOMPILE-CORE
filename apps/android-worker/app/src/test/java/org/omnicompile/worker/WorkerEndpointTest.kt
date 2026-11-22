package org.omnicompile.worker

import org.junit.Assert.*
import org.junit.Test

class WorkerEndpointTest {
    @Test fun canonicalOriginUsesDiscoveryInsteadOfVercelWebSocket() {
        assertNull(WorkerEndpoint.localEndpoint("https://frontend.example.com"))
        assertEquals("wss://backend.example.com/ws/worker", WorkerEndpoint.validate("wss://backend.example.com/ws/worker"))
    }
    @Test fun isolatedLoopbackKeepsDirectTransport() {
        assertEquals("ws://127.0.0.1:4100/ws/worker", WorkerEndpoint.localEndpoint("http://127.0.0.1:4100"))
    }
    @Test fun rejectsInsecurePublicOriginAndCredentialBearingDestinations() {
        for(value in listOf("ws://backend.example.com/ws/worker", "wss://user:secret@backend.example.com/ws/worker", "wss://backend.example.com/ws/worker?token=secret", "wss://backend.example.com/other")) {
            try { WorkerEndpoint.validate(value); fail("Unsafe destination accepted") } catch(_:IllegalArgumentException) {}
        }
        try { WorkerEndpoint.localEndpoint("http://public.example.com"); fail("Insecure origin accepted") } catch(_:IllegalArgumentException) {}
    }
}
