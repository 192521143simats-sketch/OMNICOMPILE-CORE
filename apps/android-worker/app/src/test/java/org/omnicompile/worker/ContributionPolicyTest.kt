package org.omnicompile.worker

import org.junit.Assert.*
import org.junit.Test

class ContributionPolicyTest {
    @Test fun conservativeDefaultsBlockCellularAndLowBattery() {
        val policy = ContributionPolicy()
        assertNotNull(policy.blockReason(10, true, true, false, 0, false))
        assertNotNull(policy.blockReason(80, true, false, true, 0, false))
        assertNull(policy.blockReason(80, true, true, false, 0, false))
    }
    @Test fun thermalAndBackgroundProtectionOverrideAvailability() {
        val policy = ContributionPolicy()
        assertNotNull(policy.blockReason(80, true, true, false, 4, false))
        assertNotNull(policy.blockReason(80, true, true, false, 0, true))
    }
}
