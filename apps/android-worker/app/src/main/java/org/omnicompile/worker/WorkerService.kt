package org.omnicompile.worker

import android.app.*
import android.content.Intent
import android.os.Build
import android.os.IBinder

class WorkerService:Service() {
    override fun onCreate() {super.onCreate();AndroidRuntime.initialize(this)}
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
        if(intent?.action=="PAUSE") {AndroidRuntime.stop("PAUSED");stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();return START_NOT_STICKY}
        val notificationBuilder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(
                NotificationChannel("contribution", "Resource contribution", NotificationManager.IMPORTANCE_LOW)
            )
            Notification.Builder(this, "contribution")
        } else {
            legacyNotificationBuilder()
        }
        val open=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val pause=PendingIntent.getService(this,1,Intent(this,WorkerService::class.java).setAction("PAUSE"),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notification=notificationBuilder.setSmallIcon(android.R.drawable.ic_popup_sync).setContentTitle("OmniCompile Core contribution controls").setContentText("Contributes only while your settings allow. Tap Pause to stop.").setContentIntent(open).setOngoing(true).addAction(Notification.Action.Builder(null,"Pause",pause).build()).build()
        startForeground(101,notification)
        AndroidRuntime.start()
        return START_NOT_STICKY
    }
    @Suppress("DEPRECATION") // Required on API 25, which has no notification channels.
    private fun legacyNotificationBuilder() =
        Notification.Builder(this).setPriority(Notification.PRIORITY_LOW)

    override fun onDestroy() {if(AndroidRuntime.state.value.connection.status !in setOf("LEFT","PAUSED","DISCONNECTED"))AndroidRuntime.stop();super.onDestroy()}
    override fun onBind(intent:Intent?):IBinder?=null
}
