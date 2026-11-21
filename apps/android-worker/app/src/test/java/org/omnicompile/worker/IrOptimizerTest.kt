package org.omnicompile.worker

import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class IrOptimizerTest {
    private fun optimize(instructions:String) = IrOptimizer.optimize(Json.parseToJsonElement("""{"name":"main","returnType":"int","parameters":[],"instructions":$instructions}""").jsonObject) {}
    private fun instructions(result:JsonObject)=result["function"]!!.jsonObject["instructions"]!!.jsonArray
    private fun removed(result:JsonObject)=result["report"]!!.jsonObject["deadInstructionsRemoved"]!!.jsonPrimitive.int
    @Test fun removesUnreachableCallsAfterReturnButKeepsReachableEffects() {
        val result=optimize("""[{"op":"call","dest":null,"callee":"observable","arguments":[]},{"op":"return","value":null},{"op":"call","dest":null,"callee":"dead","arguments":[]}]""")
        assertEquals(2,instructions(result).size)
        assertEquals("observable",instructions(result)[0].jsonObject["callee"]!!.jsonPrimitive.content)
        assertEquals(1,removed(result))
    }
    @Test fun removesJumpedOverCallAndPreservesLoopCarriedValues() {
        val source="""[{"op":"jump","target":"loop"},{"op":"call","dest":null,"callee":"dead","arguments":[]},{"op":"label","name":"loop"},{"op":"call","dest":null,"callee":"observable","arguments":[]},{"op":"binary","dest":"%t1","operator":"+","left":"%t1","right":"step"},{"op":"branch","condition":"condition","thenLabel":"loop","elseLabel":"done"},{"op":"label","name":"done"},{"op":"return","value":"%t1"}]"""
        val result=optimize(source)
        assertEquals(7,instructions(result).size)
        assertFalse(result.toString().contains("\"dead\""))
        assertTrue(instructions(result).any{it.jsonObject["dest"]?.jsonPrimitive?.content=="%t1"})
        assertTrue(instructions(result).any{it.jsonObject["callee"]?.jsonPrimitive?.content=="observable"})
        assertEquals(1,removed(result))
    }
    @Test fun retainsUnresolvedTargetsAndDuplicateLabelsWithoutReachabilityClaims() {
        for(source in listOf(
            """[{"op":"return","value":null},{"op":"jump","target":"missing"},{"op":"call","dest":null,"callee":"preserved","arguments":[]}]""",
            """[{"op":"return","value":null},{"op":"branch","condition":"condition","thenLabel":"known","elseLabel":"missing"},{"op":"label","name":"known"},{"op":"call","dest":null,"callee":"preserved","arguments":[]}]""",
            """[{"op":"return","value":null},{"op":"label","name":"same"},{"op":"call","dest":null,"callee":"preserved","arguments":[]},{"op":"label","name":"same"},{"op":"jump","target":"same"}]"""
        )) {
            val result=optimize(source)
            assertEquals(Json.parseToJsonElement(source),instructions(result))
            assertEquals(0,removed(result))
        }
    }
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
