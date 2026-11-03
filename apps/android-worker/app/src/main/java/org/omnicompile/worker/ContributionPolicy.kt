package org.omnicompile.worker

data class ContributionPolicy(
    val wifiOnly: Boolean = true, val chargingOnly: Boolean = false,
    val minBattery: Int = 25, val allowMetered: Boolean = false,
    val allowBackground: Boolean = false, val thermalProtection: Boolean = true,
    val maxTaskDurationMs: Long = 30000, val maxMemoryBytes: Long = 16 * 1024 * 1024,
    val maxCpuPercent: Int = 50
) {
    init {
        require(minBattery in 0..100 && maxCpuPercent in 1..100)
        require(maxTaskDurationMs in 1..30000 && maxMemoryBytes in 4*1024*1024..64*1024*1024)
    }
    fun blockReason(battery: Int, charging: Boolean, wifi: Boolean, metered: Boolean, thermal: Int, background: Boolean): String? = when {
        battery < minBattery -> "Battery is below the contribution threshold."
        chargingOnly && !charging -> "Waiting for charging."
        wifiOnly && !wifi -> "Waiting for Wi-Fi."
        !allowMetered && metered -> "Metered contribution is disabled."
        thermalProtection && thermal >= 3 -> "Paused for thermal protection."
        background && !allowBackground -> "Background contribution is disabled."
        else -> null
    }
}
