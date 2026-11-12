package org.omnicompile.worker

import android.app.ActivityManager
import androidx.annotation.ChecksSdkIntAtLeast
import android.content.*
import android.net.*
import android.os.*
import kotlinx.serialization.json.*
import java.time.Instant

class DeviceResources(private val context:Context) {
    @Volatile var foreground=true
    private var previousCpu=android.os.Process.getElapsedCpuTime()
    private var previousWall=SystemClock.elapsedRealtime()
    @Volatile var processCpuPercent:Double?=null;private set
    private val memory get()=ActivityManager.MemoryInfo().also{(context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(it)}
    private val connectivity get()=context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private val battery get()=context.registerReceiver(null,IntentFilter(Intent.ACTION_BATTERY_CHANGED))
    fun batteryPercent():Int {val b=battery;val level=b?.getIntExtra(BatteryManager.EXTRA_LEVEL,-1)?:-1;val scale=b?.getIntExtra(BatteryManager.EXTRA_SCALE,-1)?:-1;return if(level>=0&&scale>0)(100L*level/scale).toInt() else -1}
    fun charging():Boolean {val status=battery?.getIntExtra(BatteryManager.EXTRA_STATUS,-1);return status==BatteryManager.BATTERY_STATUS_CHARGING||status==BatteryManager.BATTERY_STATUS_FULL}
    @get:ChecksSdkIntAtLeast(api = Build.VERSION_CODES.Q)
    val supportsThermalTelemetry get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
    fun thermal():Int = if(supportsThermalTelemetry)(context.getSystemService(Context.POWER_SERVICE) as PowerManager).currentThermalStatus else -1
    fun network():String {val cm=connectivity;val caps=cm.getNetworkCapabilities(cm.activeNetwork)?:return "OFFLINE";return when{caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)->"WIFI";caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)->"ETHERNET";caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)->"CELLULAR";else->"UNKNOWN"}}
    fun blockReason(policy:ContributionPolicy):String? {
        val type=network();if(type=="OFFLINE")return "Waiting for network connectivity."
        return policy.blockReason(batteryPercent(),charging(),type=="WIFI",connectivity.isActiveNetworkMetered,thermal(),!foreground)
    }
    fun profile(policy:ContributionPolicy)=buildJsonObject {
        put("workerType","ANDROID");put("deviceType",if(context.resources.configuration.smallestScreenWidthDp>=600)"TABLET" else "PHONE")
        put("cpuModel",if(Build.VERSION.SDK_INT>=31)Build.SOC_MODEL.take(300) else Build.HARDWARE.take(300))
        put("logicalCores",Runtime.getRuntime().availableProcessors());put("totalMemoryBytes",memory.totalMem)
        put("operatingSystem","Android ${Build.VERSION.RELEASE}");put("architecture",Build.SUPPORTED_ABIS.firstOrNull()?:"unknown")
        put("runtimes",buildJsonObject{put("c",false);put("python",false);put("java",false)})
        put("toolchains",buildJsonObject{for(language in listOf("c","python","java"))put(language,buildJsonObject{put("available",false)})})
        put("operations",buildJsonObject{put("irOptimization",true);put("staticAnalysis",false);put("browserCompute",true);put("nativeCompilation",false);put("nativeCSource",false);put("taskCancellation",true);put("portableMatrix",true);put("portableBenchmark",true)})
        // maxCpuPercent in coordinator admission requires OS-wide CPU telemetry.
        // Android exposes only our process CPU here. Cooperative local duty is a
        // separate control, never an advertised OS-wide admission/hard-cap claim.
        put("contributionPolicy",buildJsonObject{put("enabled",true);put("wifiOnly",policy.wifiOnly);put("chargingOnly",policy.chargingOnly);put("minBatteryPercent",policy.minBattery);put("allowBackground",policy.allowBackground);put("thermalProtection",policy.thermalProtection);put("maxTaskDurationMs",policy.maxTaskDurationMs);put("maxMemoryBytes",policy.maxMemoryBytes)})
    }
    @Synchronized fun snapshot():JsonObject {
        val ram=memory;val wall=SystemClock.elapsedRealtime();val cpu=android.os.Process.getElapsedCpuTime();val delta=wall-previousWall
        val percent=if(delta>0)((cpu-previousCpu)*100.0/delta/Runtime.getRuntime().availableProcessors()).coerceIn(0.0,100.0)else 0.0
        previousWall=wall;previousCpu=cpu
        processCpuPercent=if(delta>0)percent else null
        return buildJsonObject {
            put("cpuUtilizationPercent",0);put("cpuMeasurementAvailable",false)
            put("freeMemoryBytes",ram.availMem);put("memoryUtilizationPercent",if(ram.totalMem>0)(100.0*(ram.totalMem-ram.availMem)/ram.totalMem).coerceIn(0.0,100.0)else 0.0);put("memoryMeasurementAvailable",ram.totalMem>0)
            put("observedAt",Instant.now().toString());val battery=batteryPercent();if(battery>=0)put("batteryPercent",battery)
            put("isCharging",charging());put("networkType",network());put("thermalState",when(val heat=thermal()){ -1->"UNKNOWN";0->"NORMAL";in 1..2->"MODERATE";in 3..4->"SEVERE";else->if(heat>=5)"CRITICAL" else "UNKNOWN"})
            put("lifecycleState",if(foreground)"FOREGROUND" else "BACKGROUND")
        }
    }
}
