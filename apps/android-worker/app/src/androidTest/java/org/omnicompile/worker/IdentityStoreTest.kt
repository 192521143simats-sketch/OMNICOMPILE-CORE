package org.omnicompile.worker

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class IdentityStoreTest {
    @Test fun keystoreRoundtripNeverWritesPlaintextCredential() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val store = IdentityStore(context, "instrumentation-identity")
        val value = buildJsonObject { put("credential", "scoped-test-credential-not-production"); put("deviceIdentity", "test-device") }
        try {
            store.save(value)
            assertEquals(value, store.load())
            assertFalse(context.getSharedPreferences("instrumentation-identity",0).getString("encrypted", "")!!.contains("scoped-test"))
            store.clear()
            assertNull(store.load())
        } finally { store.clear() }
    }
}
