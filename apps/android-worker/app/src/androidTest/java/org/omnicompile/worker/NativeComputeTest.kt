package org.omnicompile.worker

import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CancellationException

/** Runs the actual Kotlin executor on ART, not JavaScript or a WebView. */
@RunWith(AndroidJUnit4::class)
class NativeComputeTest {
    @Test fun realDeviceComputesAndCancelsPortableWork() {
        val prime = PortableExecutor.execute(Json.parseToJsonElement("""{"operation":"prime_count","limit":100}""").jsonObject)
        assertEquals(25, prime["count"]!!.jsonPrimitive.int)
        val matrix = PortableExecutor.execute(Json.parseToJsonElement("""{"operation":"matrix_multiply","left":[[2,3]],"right":[[4],[5]]}""").jsonObject)
        assertEquals("[[23]]", matrix["matrix"].toString())
        assertThrows(CancellationException::class.java) {
            PortableExecutor.execute(Json.parseToJsonElement("""{"operation":"sha256_chain","input":"test","iterations":10000000}""").jsonObject, cancelled = { true })
        }
    }
}
