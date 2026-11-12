package org.omnicompile.worker
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import android.os.Bundle
import android.os.Build
import android.content.Intent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import kotlinx.serialization.json.jsonPrimitive

class MainActivity:ComponentActivity() {
    override fun onCreate(savedInstanceState:Bundle?) {
        super.onCreate(savedInstanceState);AndroidRuntime.initialize(this)
        val shared=if(intent.action==Intent.ACTION_SEND)intent.getStringExtra(Intent.EXTRA_TEXT)?:"" else ""
        setContent {WorkerTheme {Surface(Modifier.fillMaxSize()) {WorkerScreen(shared)}}}
    }
    override fun onStart(){super.onStart();AndroidRuntime.enteredForeground()}
    override fun onStop(){AndroidRuntime.exitedForeground();super.onStop()}
    private fun connect() {
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED)requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),10)
        val service = Intent(this, WorkerService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(service)
        } else {
            startService(service)
        }
    }
    @Composable private fun WorkerScreen(shared:String) {
        val model by AndroidRuntime.state.collectAsState()
        var link by remember {mutableStateOf(shared)}
        var consent by remember {mutableStateOf(false)}
        var settings by remember {mutableStateOf(false)}
        var logs by remember {mutableStateOf(false)}
        var importing by remember {mutableStateOf(false)}
        var replacement by remember {mutableStateOf("")}
        var enrollmentId by remember {mutableStateOf("")}
        val scope=rememberCoroutineScope()
        Column(Modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
            Text("OmniCompile Core Worker",style=MaterialTheme.typography.headlineMedium)
            Text("Native Android contribution • ${BuildConfig.VERSION_NAME} • Protocol 1")
            Text("${Build.MANUFACTURER} ${Build.MODEL} · Android ${Build.VERSION.RELEASE} · ${Build.SUPPORTED_ABIS.firstOrNull()}")
            Text("${Runtime.getRuntime().availableProcessors()} CPU cores · Battery ${AndroidRuntime.device.batteryPercent().takeIf{it>=0}?:"not available"}% · ${AndroidRuntime.device.network()}")
            Text("Status: ${model.connection.status}",style=MaterialTheme.typography.titleMedium)
            val measured=model.resources
            if(measured!=null){
                Text("Available system RAM: ${measured["freeMemoryBytes"]?.jsonPrimitive?.content?.toLongOrNull()?.div(1024*1024)?:"Not available"} MiB")
                Text("Thermal: ${measured["thermalState"]?.jsonPrimitive?.content}; charging: ${measured["isCharging"]?.jsonPrimitive?.content}")
                Text("App-process CPU (core-normalized): ${AndroidRuntime.device.processCpuPercent?.let{"%.1f%%".format(it)}?:"Not available"}. OS-wide CPU is unavailable.")
            }
            if(model.pending)LinearProgressIndicator(Modifier.fillMaxWidth())
            if(model.error.isNotEmpty())Text(model.error,color=MaterialTheme.colorScheme.error)
            if(model.connection.error.isNotEmpty())Text(model.connection.error,color=MaterialTheme.colorScheme.error)
            if(!model.hasEnrollment) {
                OutlinedTextField(value=link,onValueChange={link=it;consent=false;AndroidRuntime.invalidateInspection()},label={Text("Network join link")},modifier=Modifier.fillMaxWidth(),enabled=!model.pending)
                Button(onClick={scope.launch{AndroidRuntime.inspect(link)}},enabled=link.isNotBlank()&&!model.pending){Text("Inspect network")}
                if(model.networkName.isNotBlank())Text("Network: ${model.networkName}")
                Text("This phone can run bounded hashing, prime counting, matrix multiplication, deterministic compute and compatible C IR optimization. It cannot run desktop GCC, Python or Java compilation. No shell commands or downloaded code will execute.")
                Text("Contribution uses battery, CPU and network under your settings. You can pause or leave at any time. Background execution is not guaranteed by Android.")
                Row {Checkbox(checked=consent,onCheckedChange={consent=it},modifier=Modifier.semantics{contentDescription="Consent to resource contribution"});Text("I consent to these bounded workloads and coordinator communication.")}
                Button(onClick={scope.launch{AndroidRuntime.enroll(consent);if(AndroidRuntime.state.value.hasEnrollment)connect()}},enabled=consent&&AndroidRuntime.hasInspectedNetwork()&&!model.pending){Text("Become a Worker")}
            } else {
                Text("Network: ${model.networkName}")
                Text("Node: ${model.connection.nodeId.ifEmpty{"Not connected"}}")
                Text("Current task: ${model.connection.currentTask?:"None"}")
                Text("Last heartbeat sent: ${model.connection.lastHeartbeat?:"Not available"}")
                val summary=model.summary
                Text("Verified coordinator records — completed: ${summary?.get("completed")?.jsonPrimitive?.content?:"Not available"}; failed: ${summary?.get("failed")?.jsonPrimitive?.content?:"Not available"}")
                Text("Reliability: ${summary?.get("reliabilityPercent")?.takeUnless{it==kotlinx.serialization.json.JsonNull}?.jsonPrimitive?.content?:"Not available"}")
                Button(onClick={connect()},enabled=!model.pending&&model.connection.status !in setOf("AVAILABLE","BUSY","CONNECTING","RECONNECTING","POLICY_PAUSED","REVOKED","ERROR")){Text("Resume contribution")}
                Button(onClick={AndroidRuntime.stop("PAUSED");stopService(Intent(this@MainActivity,WorkerService::class.java))},enabled=!model.pending){Text("Pause contribution")}
                OutlinedButton(onClick={AndroidRuntime.stop();stopService(Intent(this@MainActivity,WorkerService::class.java))},enabled=!model.pending){Text("Disconnect")}
                OutlinedButton(onClick={scope.launch{AndroidRuntime.leave();stopService(Intent(this@MainActivity,WorkerService::class.java))}},enabled=!model.pending){Text("Leave network")}
                OutlinedButton(onClick={scope.launch{AndroidRuntime.rotateCredential();stopService(Intent(this@MainActivity,WorkerService::class.java))}},enabled=!model.pending){Text("Rotate private credential")}
                Text("Rotation stops contribution and saves the replacement in protected storage. Resume explicitly afterward. If saving fails, retry rotation before closing the app.",style=MaterialTheme.typography.bodySmall)
                OutlinedButton(onClick={importing=!importing;replacement=""},enabled=!model.pending){Text("Administrator replacement credential")}
                if(importing){
                    Text("Use only a securely supplied replacement for this exact enrollment. Import verifies its scope and pauses contribution.")
                    OutlinedTextField(value=enrollmentId,onValueChange={enrollmentId=it},label={Text("Original enrollment ID")},modifier=Modifier.fillMaxWidth(),enabled=!model.pending)
                    OutlinedTextField(value=replacement,onValueChange={if(it.length<=2048)replacement=it},label={Text("Replacement private credential")},visualTransformation=androidx.compose.ui.text.input.PasswordVisualTransformation(),modifier=Modifier.fillMaxWidth(),enabled=!model.pending)
                    Button(onClick={scope.launch{AndroidRuntime.importCredential(replacement,enrollmentId.trim());replacement="";stopService(Intent(this@MainActivity,WorkerService::class.java))}},enabled=!model.pending&&replacement.length>=20&&enrollmentId.isNotBlank()){Text("Verify and save replacement")}
                }
            }
            OutlinedButton(onClick={settings=!settings}){Text("Settings")}
            if(settings) {
                val policy=model.policy
                fun save(value:ContributionPolicy){scope.launch{withContext(Dispatchers.IO){try{AndroidRuntime.savePolicy(value)}catch(_:Exception){AndroidRuntime.settingsError()}};stopService(Intent(this@MainActivity,WorkerService::class.java))}}
                Text("Saving settings pauses contribution. Resume explicitly.")
                Toggle("Wi-Fi only",policy.wifiOnly,!model.pending){save(policy.copy(wifiOnly=it))}
                Toggle("Charging only",policy.chargingOnly,!model.pending){save(policy.copy(chargingOnly=it))}
                Toggle("Allow metered network",policy.allowMetered,!model.pending){save(policy.copy(allowMetered=it))}
                Toggle("Allow visible background contribution",policy.allowBackground,!model.pending){save(policy.copy(allowBackground=it))}
                if (AndroidRuntime.device.supportsThermalTelemetry) {
                    Toggle("Thermal protection", policy.thermalProtection, !model.pending) {
                        save(policy.copy(thermalProtection = it))
                    }
                } else {
                    Text("Thermal protection requires Android 10 or later.")
                }
                Text("Minimum battery: ${policy.minBattery}%")
                Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){OutlinedButton(onClick={save(policy.copy(minBattery=(policy.minBattery-5).coerceAtLeast(0)))}){Text("Battery −5%")};OutlinedButton(onClick={save(policy.copy(minBattery=(policy.minBattery+5).coerceAtMost(100)))}){Text("Battery +5%")}}
                Text("Cooperative CPU duty target: ${policy.maxCpuPercent}% (not an OS hard cap)")
                Row{OutlinedButton(onClick={save(policy.copy(maxCpuPercent=25))}){Text("25%")};OutlinedButton(onClick={save(policy.copy(maxCpuPercent=50))}){Text("50%")};OutlinedButton(onClick={save(policy.copy(maxCpuPercent=100))}){Text("100%")}}
                Text("Task deadline ${policy.maxTaskDurationMs/1000}s; input working-memory budget ${policy.maxMemoryBytes/1024/1024} MiB. Runtime/OS memory is not a hard heap sandbox.")
                Row{OutlinedButton(onClick={save(policy.copy(maxTaskDurationMs=10000))}){Text("10 seconds")};OutlinedButton(onClick={save(policy.copy(maxTaskDurationMs=30000))}){Text("30 seconds")}}
                Row{OutlinedButton(onClick={save(policy.copy(maxMemoryBytes=8*1024*1024))}){Text("8 MiB")};OutlinedButton(onClick={save(policy.copy(maxMemoryBytes=16*1024*1024))}){Text("16 MiB")};OutlinedButton(onClick={save(policy.copy(maxMemoryBytes=32*1024*1024))}){Text("32 MiB")}}
            }
            OutlinedButton(onClick={logs=!logs}){Text("Recent activity and diagnostics")}
            if(logs)for(line in model.logs)Text(line,style=MaterialTheme.typography.bodySmall)
            HorizontalDivider()
            Text("Privacy: only enrollment identity, capability/resource information and authorized task results are sent. No contacts, photos, location or microphone access. This app contributes resources under your consent; closing or force-stopping it may interrupt work. OmniCompile Core does not promise uninterrupted background operation.",style=MaterialTheme.typography.bodySmall)
        }
    }
    @Composable private fun Toggle(label:String,value:Boolean,enabled:Boolean=true,onChange:(Boolean)->Unit) {Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){Text(label,Modifier.weight(1f));Switch(checked=value,onCheckedChange=onChange,enabled=enabled,modifier=Modifier.semantics{contentDescription=label})}}
}
