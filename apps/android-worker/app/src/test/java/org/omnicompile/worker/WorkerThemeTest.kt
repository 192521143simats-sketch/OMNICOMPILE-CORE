package org.omnicompile.worker

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import org.junit.Assert.assertTrue
import org.junit.Test

class WorkerThemeTest {
    private fun contrast(a: Color, b: Color): Float {
        val first=a.luminance(); val second=b.luminance()
        return (maxOf(first,second)+0.05f)/(minOf(first,second)+0.05f)
    }
    @Test fun darkDeviceUsesDarkBackgroundAndReadableForegrounds() {
        val scheme=workerColorScheme(true)
        assertTrue(scheme.background.luminance()<0.1f)
        assertTrue(scheme.onBackground.luminance()>0.8f)
        assertReadable(scheme)
    }
    @Test fun lightDeviceStillUsesCarbonBackgroundAndReadableForegrounds() {
        val scheme=workerColorScheme(false)
        assertTrue(scheme.background==Color(0xFF0C0D10))
        assertTrue(scheme.onBackground==Color.White)
        assertTrue(scheme.primary==Color(0xFFFF4D2E))
        assertReadable(scheme)
    }
    private fun assertReadable(scheme: androidx.compose.material3.ColorScheme) {
        for ((foreground,background) in listOf(scheme.onBackground to scheme.background,
            scheme.onSurface to scheme.surface, scheme.onSurfaceVariant to scheme.surfaceVariant,
            scheme.onPrimary to scheme.primary, scheme.onError to scheme.error)) {
            assertTrue("Text contrast must meet WCAG AA",contrast(foreground,background)>=4.5f)
        }
    }
}
