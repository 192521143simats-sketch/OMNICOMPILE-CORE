package org.omnicompile.worker
import kotlinx.serialization.json.*
object IrOptimizer {
    fun optimize(function:JsonObject, checkpoint:()->Unit):JsonObject {
        require(function.keys==setOf("name","returnType","parameters","instructions"))
        fun JsonObject.text(key:String):String { val value=this[key] as? JsonPrimitive; require(value?.isString==true&&value.content.length in 1..200); return value.content }
        function.text("name"); require(function.text("returnType") in setOf("int","void"))
        val parameters=function["parameters"] as? JsonArray; require(parameters!=null&&parameters.size<=128)
        for(parameter in parameters) { val p=parameter.jsonObject; require(p.keys==setOf("name","type","value"));p.text("name");p.text("value");require(p.text("type") in setOf("int","void")) }
        val input=function["instructions"] as? JsonArray; require(input!=null&&input.size<=100000)
        val constants=mutableMapOf<String,Int>(); val output=mutableListOf<JsonObject>()
        var folds=0; var simplified=0; var removed=0
        fun constant(dest:String,value:Int)=buildJsonObject{put("op","const");put("dest",dest);put("value",value)}
        fun copy(dest:String,source:String)=buildJsonObject{put("op","copy");put("dest",dest);put("source",source)}
        val fields=mapOf("const" to setOf("op","dest","value"),"copy" to setOf("op","dest","source"),"unary" to setOf("op","dest","operator","operand"),"binary" to setOf("op","dest","operator","left","right"),"call" to setOf("op","dest","callee","arguments"),"label" to setOf("op","name"),"branch" to setOf("op","condition","thenLabel","elseLabel"),"jump" to setOf("op","target"),"return" to setOf("op","value"))
        for(element in input) {
            checkpoint();val i=element.jsonObject; val op=i.text("op");require(i.keys==fields[op])
            if(op in setOf("label","branch","jump"))constants.clear()
            when(op) {
                "const" -> {val raw=i["value"] as? JsonPrimitive;val value=if(raw?.isString==false)raw.intOrNull else null;require(value!=null);constants[i.text("dest")]=value;output.add(i)}
                "copy" -> {val dest=i.text("dest");val value=constants[i.text("source")];if(value!=null){constants[dest]=value;output.add(constant(dest,value));folds++}else{constants.remove(dest);output.add(i)}}
                "unary" -> {
                    val dest=i.text("dest");val operator=i.text("operator");require(operator in setOf("+","-","!"));val value=constants[i.text("operand")]
                    if(value!=null&&!(operator=="-"&&value==Int.MIN_VALUE)){val folded=when(operator){"+"->value;"-"->-value;else->if(value==0)1 else 0};constants[dest]=folded;output.add(constant(dest,folded));folds++}else{constants.remove(dest);output.add(i)}
                }
                "binary" -> {
                    val dest=i.text("dest");val operator=i.text("operator");require(operator in setOf("+","-","*","/","%","==","!=","<","<=",">",">=","&&","||"))
                    val leftName=i.text("left");val rightName=i.text("right");val left=constants[leftName];val right=constants[rightName]
                    val folded=if(left!=null&&right!=null)evaluate(operator,left,right) else null
                    if(folded!=null){constants[dest]=folded;output.add(constant(dest,folded));folds++}
                    else {
                        constants.remove(dest)
                        val replacement=when {
                            operator in setOf("+","-")&&right==0 || operator in setOf("*","/")&&right==1 -> copy(dest,leftName)
                            operator=="+"&&left==0 || operator=="*"&&left==1 -> copy(dest,rightName)
                            else -> null
                        }
                        if(replacement!=null){output.add(replacement);simplified++}else output.add(i)
                    }
                }
                "call" -> {i.text("callee");val args=i["arguments"] as? JsonArray;require(args!=null&&args.size<=128);args.forEach{require(it is JsonPrimitive&&it.isString&&it.content.length in 1..200)};if(i["dest"]!=JsonNull)constants.remove(i.text("dest"));output.add(i)}
                "label" -> {i.text("name");output.add(i)}
                "branch" -> {i.text("condition");i.text("thenLabel");i.text("elseLabel");output.add(i)}
                "jump" -> {i.text("target");output.add(i)}
                "return" -> {if(i["value"]!=JsonNull)i.text("value");output.add(i)}
                else -> throw IllegalArgumentException("Unsupported IR instruction.")
            }
        }
        val controlFlow=output.any{it.text("op") in setOf("branch","jump")};val live=mutableSetOf<String>();val kept=mutableListOf<JsonObject>()
        for(i in output.asReversed()) {
            checkpoint();val op=i.text("op");val dest=if(op in setOf("const","copy","unary","binary","call")&&i["dest"]!=JsonNull)i.text("dest")else null
            if(!controlFlow&&dest?.startsWith("%t")==true&&op in setOf("const","copy","unary","binary")&&dest !in live){removed++;continue}
            if(dest!=null)live.remove(dest)
            when(op){"copy"->live.add(i.text("source"));"unary"->live.add(i.text("operand"));"binary"->{live.add(i.text("left"));live.add(i.text("right"))};"call"->i["arguments"]!!.jsonArray.forEach{live.add(it.jsonPrimitive.content)};"branch"->live.add(i.text("condition"));"return"->if(i["value"]!=JsonNull)live.add(i.text("value"))}
            kept.add(i)
        }
        return buildJsonObject { put("operation","c_optimize_ir");put("function",JsonObject(function+ ("instructions" to JsonArray(kept.asReversed()))));put("report",buildJsonObject{put("constantFolds",folds);put("algebraicSimplifications",simplified);put("deadInstructionsRemoved",removed)}) }
    }
    private fun evaluate(op:String,left:Int,right:Int):Int? {
        if(op in setOf("/","%")&&(right==0||left==Int.MIN_VALUE&&right== -1))return null
        val a=left.toLong();val b=right.toLong()
        val result=when(op){"+"->a+b;"-"->a-b;"*"->a*b;"/"->a/b;"%"->a%b;"=="->if(a==b)1L else 0L;"!="->if(a!=b)1L else 0L;"<"->if(a<b)1L else 0L;"<="->if(a<=b)1L else 0L;">"->if(a>b)1L else 0L;">="->if(a>=b)1L else 0L;"&&"->if(a!=0L&&b!=0L)1L else 0L;"||"->if(a!=0L||b!=0L)1L else 0L;else->return null}
        return if(result in Int.MIN_VALUE.toLong()..Int.MAX_VALUE.toLong())result.toInt()else null
    }
}
