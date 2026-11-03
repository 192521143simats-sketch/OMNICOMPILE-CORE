package org.omnicompile.worker

import org.junit.Assert.*
import org.junit.Test

class InvitationTest {
    @Test fun preservesOnlyOriginAndAdmissionToken() {
        val parsed = Invitation.parse("https://grid.example/join/abcdefghijklmnop", false)
        assertEquals("https://grid.example", parsed.origin)
        assertEquals("abcdefghijklmnop", parsed.token)
    }
    @Test fun rejectsSecretsInUrlAndReleaseCleartext() {
        for (input in listOf("http://grid.example/join/abcdefghijklmnop", "https://user:pass@grid.example/join/abcdefghijklmnop", "https://grid.example/join/token?credential=abc", "file:///join/token"))
            assertThrows(IllegalArgumentException::class.java) { Invitation.parse(input, false) }
    }
    @Test fun permitsExplicitDevelopmentLoopbackOnlyInDebug() {
        assertEquals("http://127.0.0.1:8999", Invitation.parse("http://127.0.0.1:8999/join/abcdefghijklmnop", true).origin)
    }
}
