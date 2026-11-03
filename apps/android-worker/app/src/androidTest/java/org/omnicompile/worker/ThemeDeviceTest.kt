package org.omnicompile.worker

import android.content.res.Configuration
import androidx.activity.compose.setContent
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class ThemeDeviceTest {
    @get:Rule val compose=createAndroidComposeRule<MainActivity>()
    @Test fun actualScreenIsDarkAndShowsControls() {
        compose.onNodeWithText("OMNICOMPILE Worker").assertIsDisplayed()
        val action=if(AndroidRuntime.state.value.hasEnrollment)"Pause contribution" else "Inspect network"
        compose.onNodeWithText(action).performScrollTo().assertIsDisplayed()
        val pixels=compose.onRoot().captureToImage().toPixelMap()
        val background=pixels[2,2].luminance()
        assertTrue("Rendered background stays dark in either Android mode",background<0.1f)
    }
    @Test fun lightConfigurationStillRendersDarkPaletteOnPhysicalDevice() {
        // Xiaomi may lock global night mode. Override only this test composition,
        // never the user's system setting, to exercise our automatic theme boundary.
        val configuration=Configuration(compose.activity.resources.configuration)
        configuration.uiMode=(configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or Configuration.UI_MODE_NIGHT_NO
        compose.runOnUiThread {
            compose.activity.setContent {
                CompositionLocalProvider(LocalConfiguration provides configuration) {
                    WorkerTheme { Surface(Modifier.fillMaxSize()) {Text("Light theme verification")} }
                }
            }
        }
        compose.onNodeWithText("Light theme verification").assertIsDisplayed()
        val pixels=compose.onRoot().captureToImage().toPixelMap()
        assertTrue("Light configuration must retain the dark surface",pixels[2,pixels.height-3].luminance()<0.1f)
    }
}
