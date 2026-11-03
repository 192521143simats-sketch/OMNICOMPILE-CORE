package org.omnicompile.worker

import kotlinx.serialization.json.*
import java.security.MessageDigest
import java.util.concurrent.CancellationException

object PortableExecutor {
    fun execute(task: JsonObject, maxDurationMs: Long = 30000, cancelled: () -> Boolean = { false }, cpuPercent:Int=100): JsonObject {
        require(maxDurationMs in 1..30000) { "Invalid execution deadline." }
        require(cpuPercent in 1..100)
        val started = System.nanoTime()
        var previousCheckpoint=started
        fun checkpoint() {
            if (cancelled() || Thread.currentThread().isInterrupted) throw CancellationException("Task cancelled.")
            val workNanos=System.nanoTime()-previousCheckpoint
            if(cpuPercent<100&&workNanos>1000000) {
                val rest=(workNanos*(100-cpuPercent)/cpuPercent).coerceAtMost(100000000)
                Thread.sleep(rest/1000000,(rest%1000000).toInt())
            }
            previousCheckpoint=System.nanoTime()
            require((System.nanoTime()-started)/1_000_000 < maxDurationMs) { "Portable execution deadline exceeded." }
        }
        fun text(name: String, max: Int): String {
            val value = task[name] as? JsonPrimitive
            require(value != null && value.isString && value.content.length <= max) { "Invalid $name." }
            return value.content
        }
        fun number(name: String, min: Long, max: Long): Long {
            val value = task[name] as? JsonPrimitive
            val parsed = if (value?.isString == false) value.longOrNull else null
            require(parsed != null && parsed in min..max) { "Invalid $name." }; return parsed
        }
        fun keys(vararg names: String) { require(task.keys == names.toSet()) { "Unexpected or missing task fields." } }
        fun digest(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes)
        fun hex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it.toInt() and 255) }
        checkpoint()
        val operation = text("operation", 40)
        if(operation=="c_optimize_ir") {
            keys("operation","function")
            val function=task["function"] as? JsonObject?:throw IllegalArgumentException("Invalid IR function.")
            return IrOptimizer.optimize(function,::checkpoint).also {checkpoint();require(it.toString().length<=2_000_000)}
        }
        val result = buildJsonObject {
            put("operation", operation)
            when (operation) {
                "sha256" -> {
                    keys("operation", "input"); val bytes = utf8(text("input",100000))
                    put("digest",hex(digest(bytes))); put("inputBytes",bytes.size)
                }
                "sha256_chain" -> {
                    keys("operation","input","iterations"); var bytes = utf8(text("input",10000))
                    val iterations = number("iterations",1,10000000).toInt()
                    val hash = MessageDigest.getInstance("SHA-256")
                    repeat(iterations) { bytes = hash.digest(bytes); if (it % 256 == 0) checkpoint() }
                    put("iterations",iterations); put("digest",hex(bytes))
                }
                "prime_count" -> {
                    keys("operation","limit"); val limit = number("limit",2,2000000).toInt()
                    val composite = BooleanArray(limit+1); var count = 0
                    for (n in 2..limit) {
                        if (!composite[n]) { count++; if (n.toLong()*n <= limit) { var m = n*n; while(m<=limit) { composite[m]=true; m+=n } } }
                        if (n % 4096 == 0) checkpoint()
                    }
                    put("limit",limit); put("count",count)
                }
                "portable_benchmark" -> {
                    keys("operation","seed","iterations"); val seed = number("seed",0,0xffffffffL)
                    val iterations = number("iterations",1,1000000).toInt(); var state = seed
                    repeat(iterations) { state = (1664525L*state+1013904223L) and 0xffffffffL; if(it%4096==0) checkpoint() }
                    put("seed",seed); put("iterations",iterations); put("checksum",state)
                }
                "matrix_multiply" -> {
                    keys("operation","left","right")
                    fun matrix(name: String): List<List<Int>> {
                        val rows = task[name] as? JsonArray; require(rows != null && rows.size in 1..32) { "Invalid matrix rows." }
                        val values = rows.map { element ->
                            val row = element as? JsonArray; require(row != null && row.size in 1..32) { "Invalid matrix columns." }
                            row.map { cell -> val primitive=cell as? JsonPrimitive; val n=if(primitive?.isString==false)primitive.intOrNull else null; require(n!=null&&n in -1000..1000) { "Invalid matrix entry." }; n }
                        }
                        require(values.all { it.size == values.first().size }) { "Ragged matrices are forbidden." }; return values
                    }
                    val left=matrix("left"); val right=matrix("right")
                    require(left.first().size == right.size) { "Matrix dimensions are incompatible." }
                    put("matrix",buildJsonArray { for(row in left) { add(buildJsonArray { for(col in right.first().indices) { var sum=0; for(k in row.indices)sum+=row[k]*right[k][col]; add(sum) } }); checkpoint() } })
                }
                else -> throw IllegalArgumentException("Unsupported Android operation.")
            }
        }
        checkpoint()
        require(result.toString().length <= 65536) { "Task output exceeds limit." }
        return result
    }
    // Match Node Buffer/TextEncoder: malformed UTF-16 becomes U+FFFD, not JVM '?'.
    private fun utf8(value:String):ByteArray {
        val normalized=StringBuilder(value.length);var index=0
        while(index<value.length){val c=value[index];when {
            c.isHighSurrogate()&&index+1<value.length&&value[index+1].isLowSurrogate()->{normalized.append(c).append(value[++index])}
            c.isSurrogate()->normalized.append('\uFFFD')
            else->normalized.append(c)
        };index++}
        return normalized.toString().toByteArray(Charsets.UTF_8)
    }
}
