package org.omnicompile.worker
import kotlinx.serialization.json.*
fun validateReplacementScope(scope:JsonObject,networkId:String,enrollmentId:String,nodeId:String,savedEnrollmentId:String?) {
    fun value(key:String)=scope[key]?.jsonPrimitive?.contentOrNull
    require(savedEnrollmentId!=null||nodeId.isNotEmpty()) {"Original worker identity cannot be verified. Leave and enroll again instead."}
    require(value("networkId")==networkId&&value("enrollmentId")==enrollmentId&&(savedEnrollmentId==null||value("enrollmentId")==savedEnrollmentId)&&(nodeId.isEmpty()||value("nodeId")==nodeId)&&value("workerType")=="ANDROID") {"Replacement does not belong to this worker enrollment."}
}
