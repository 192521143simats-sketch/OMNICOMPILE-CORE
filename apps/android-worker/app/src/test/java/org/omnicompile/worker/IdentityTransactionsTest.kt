package org.omnicompile.worker
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

class IdentityTransactionsTest {
    @Test fun settingsCannotInterleaveWithAnEnrollmentWrite() = runBlocking {
        val transactions=IdentityTransactions();val started=CompletableDeferred<Unit>();val admitted=CompletableDeferred<Unit>();var record=mapOf("policy" to "old")
        val enrollment=launch { transactions.run {val captured=record;started.complete(Unit);admitted.await();record=captured+("credential" to "scoped")} }
        started.await()
        val settings=launch { transactions.run {record=record+("policy" to "new")} }
        yield();admitted.complete(Unit);enrollment.join();settings.join()
        assertEquals(mapOf("policy" to "new","credential" to "scoped"),record)
    }
}
