package org.omnicompile.worker
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
class ReplacementCredentialTest {
    @Test fun replacementCannotChangeEnrollmentNetworkOrKnownNode() {
        val scope=buildJsonObject{put("networkId","n1");put("enrollmentId","e1");put("nodeId","NODE-A001");put("workerType","ANDROID")}
        validateReplacementScope(scope,"n1","e1","NODE-A001","e1")
        for(key in listOf("networkId","enrollmentId","nodeId","workerType"))assertThrows(IllegalArgumentException::class.java){validateReplacementScope(JsonObject(scope+(key to JsonPrimitive("other"))),"n1","e1","NODE-A001","e1")}
    }
}
