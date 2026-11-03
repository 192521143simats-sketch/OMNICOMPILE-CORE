package org.omnicompile.worker

import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.CancellationException

class PortableExecutorTest {
    private fun run(input: String) = PortableExecutor.execute(Json.parseToJsonElement(input).jsonObject)
    @Test fun sha256UsesUtf8AndKnownDigest() {
        val result = run("""{"operation":"sha256","input":"abc"}""")
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", result["digest"]!!.jsonPrimitive.content)
        assertEquals(3, result["inputBytes"]!!.jsonPrimitive.int)
    }
    @Test fun primeCountIsNotHardcoded() { assertEquals(8, run("""{"operation":"prime_count","limit":20}""")["count"]!!.jsonPrimitive.int) }
    @Test fun matrixUsesExactIntegerProducts() { assertEquals("[[19,22],[43,50]]",run("""{"operation":"matrix_multiply","left":[[1,2],[3,4]],"right":[[5,6],[7,8]]}""")["matrix"].toString()) }
    @Test fun benchmarkUsesUnsignedOverflow() { assertEquals(1015568748L,run("""{"operation":"portable_benchmark","seed":1,"iterations":1}""")["checksum"]!!.jsonPrimitive.long) }
    @Test fun rejectsArbitraryCodeAndOversizedInputs() {
        for (input in listOf("""{"operation":"shell","command":"id"}""","""{"operation":"prime_count","limit":2000001}""","""{"operation":"prime_count","limit":2.5}""","""{"operation":"sha256","input":"abc","command":"id"}""")) {
            assertThrows(IllegalArgumentException::class.java) { run(input) }
        }
    }
    @Test fun cancellationStopsWork() { assertThrows(CancellationException::class.java) { PortableExecutor.execute(Json.parseToJsonElement("""{"operation":"prime_count","limit":2000000}""").jsonObject, cancelled = { true }) } }
    @Test fun deadlineStopsWork() { assertThrows(IllegalArgumentException::class.java) { PortableExecutor.execute(Json.parseToJsonElement("""{"operation":"prime_count","limit":2000000}""").jsonObject, maxDurationMs = 0) } }
    @Test fun chainHashesBinaryDigestNotHexText() {
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",run("""{"operation":"sha256_chain","input":"abc","iterations":1}""")["digest"]!!.jsonPrimitive.content)
    }
    @Test fun rejectsRaggedAndIncompatibleMatrices() {
        for (input in listOf("""{"operation":"matrix_multiply","left":[[1],[2,3]],"right":[[4]]}""","""{"operation":"matrix_multiply","left":[[1,2]],"right":[[4]]}"""))
            assertThrows(IllegalArgumentException::class.java) { run(input) }
    }
    @Test fun malformedUnicodeMatchesCoordinatorUtf8Replacement() {
        val result=run("""{"operation":"sha256","input":"\ud800"}""")
        assertEquals(3,result["inputBytes"]!!.jsonPrimitive.int)
        assertEquals("83d544ccc223c057d2bf80d3f2a32982c32c3c0db8e2674820da5064783fb097",result["digest"]!!.jsonPrimitive.content)
    }
}
