package org.omnicompile.worker
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.junit.Rule
import org.junit.Test

class NativeUiTest {
    @get:Rule val compose=createAndroidComposeRule<MainActivity>()
    @Test fun initialScreenRequiresInspectionAndExplicitConsent() {
        org.junit.Assume.assumeFalse("Existing enrollment is preserved. Use -PomnicompileIsolatedAcceptance=true for fresh acceptance.",AndroidRuntime.state.value.hasEnrollment)
        compose.onNodeWithText("OMNICOMPILE Worker").assertIsDisplayed()
        compose.onNodeWithText("Become a Worker").performScrollTo().assertIsNotEnabled()
    }
}
