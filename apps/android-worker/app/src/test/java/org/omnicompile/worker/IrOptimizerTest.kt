package org.omnicompile.worker

import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class IrOptimizerTest {
    private fun optimize(instructions:String) = IrOptimizer.optimize(Json.parseToJsonElement("""{"name":"main","returnType":"int","parameters":[],"instructions":$instructions}""").jsonObject) {}
    @Test fun foldsConstantsAndPreservesReturn() {
        val result=optimize("""[{"op":"const","dest":"%t1","value":2},{"op":"const","dest":"%t2","value":3},{"op":"binary","dest":"%t3","operator":"+","left":"%t1","right":"%t2"},{"op":"return","value":"%t3"}]""")
        assertEquals("""[{"op":"const","dest":"%t3","value":5},{"op":"return","value":"%t3"}]""",result["function"]!!.jsonObject["instructions"].toString())
        assertEquals(1,result["report"]!!.jsonObject["constantFolds"]!!.jsonPrimitive.int)
        assertEquals(2,result["report"]!!.jsonObject["deadInstructionsRemoved"]!!.jsonPrimitive.int)
    }
    @Test fun preservesOverflowDivisionAndObservableCalls() {
        for(op in listOf("/","+")) {
            val right=if(op=="/")0 else 1
            val result=optimize("""[{"op":"const","dest":"a","value":2147483647},{"op":"const","dest":"b","value":$right},{"op":"binary","dest":"result","operator":"$op","left":"a","right":"b"},{"op":"call","dest":null,"callee":"effect","arguments":[]},{"op":"return","value":"result"}]""")
            assertTrue(result["function"]!!.jsonObject["instructions"]!!.jsonArray.any{it.jsonObject["op"]!!.jsonPrimitive.content=="binary"})
            assertTrue(result.toString().contains("effect"))
        }
    }
}
