package org.omnicompile.worker
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
class IdentityTransactions {
    private val mutex=Mutex()
    suspend fun run(work:suspend ()->Unit) {mutex.withLock{work()}}
}
