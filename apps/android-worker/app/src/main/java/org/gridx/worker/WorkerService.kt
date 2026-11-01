package org.gridx.worker

import android.app.*
import android.content.Intent
import android.os.IBinder

class WorkerService:Service() {
    override fun onCreate() {super.onCreate();AndroidRuntime.initialize(this)}
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
        if(intent?.action=="PAUSE") {AndroidRuntime.stop("PAUSED");stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();return START_NOT_STICKY}
        val manager=getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("contribution","Resource contribution",NotificationManager.IMPORTANCE_LOW))
        val open=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val pause=PendingIntent.getService(this,1,Intent(this,WorkerService::class.java).setAction("PAUSE"),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notification=Notification.Builder(this,"contribution").setSmallIcon(android.R.drawable.ic_popup_sync).setContentTitle("OmniCompile Core contribution controls").setContentText("Contributes only while your settings allow. Tap Pause to stop.").setContentIntent(open).setOngoing(true).addAction(Notification.Action.Builder(null,"Pause",pause).build()).build()
        startForeground(101,notification)
        AndroidRuntime.start()
        return START_NOT_STICKY
    }
    override fun onDestroy() {if(AndroidRuntime.state.value.connection.status !in setOf("LEFT","PAUSED","DISCONNECTED"))AndroidRuntime.stop();super.onDestroy()}
    override fun onBind(intent:Intent?):IBinder?=null
}
