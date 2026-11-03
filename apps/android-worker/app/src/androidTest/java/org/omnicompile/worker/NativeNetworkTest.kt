package org.omnicompile.worker

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.*

/** Requires an explicitly owned, live isolated coordinator. Never uses developer credentials. */
class NativeNetworkTest {
    @get:Rule val compose=createAndroidComposeRule<MainActivity>()
    @Test fun enrollsContributesRecoversPausesAndLeaves() {
        val args=InstrumentationRegistry.getArguments()
        val join=args.getString("omnicompileJoin")
        Assume.assumeTrue("Run through verify:android-native with isolated fixtures",join!=null)
        require(args.getString("omnicompileInstance")?.matches(Regex("[a-f0-9]{16}"))==true)
        require(!AndroidRuntime.state.value.hasEnrollment) { "Preserve existing enrollment; leave explicitly before isolated acceptance." }
        compose.activityRule.scenario.onActivity{it.window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)}
        try {
            compose.onNodeWithText("Network join link").performTextInput(join!!)
            compose.onNodeWithText("Inspect network").performScrollTo().performClick()
            compose.waitUntil(30000){AndroidRuntime.hasInspectedNetwork()&&!AndroidRuntime.state.value.pending}
            compose.onNodeWithText("Become a Worker").performScrollTo().assertIsNotEnabled()
            compose.onNodeWithContentDescription("Consent to resource contribution").performScrollTo().performClick()
            compose.onNodeWithText("Become a Worker").performScrollTo().performClick()
            compose.waitUntil(60000){AndroidRuntime.state.value.connection.status=="AVAILABLE"}
            val node=AndroidRuntime.state.value.connection.nodeId
            Assert.assertTrue(node.matches(Regex("NODE-[A-Z]+[0-9]{3,}")))
            compose.waitUntil(240000){AndroidRuntime.state.value.connection.status=="REVOKED"||(AndroidRuntime.state.value.summary?.get("completed") as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull()?.let{it>=6}==true}
            Assert.assertNotEquals("Isolated network was revoked before contribution completed","REVOKED",AndroidRuntime.state.value.connection.status)
            compose.onNodeWithText("Rotate private credential").performScrollTo().performClick()
            compose.waitUntil(30000){!AndroidRuntime.state.value.pending&&AndroidRuntime.state.value.connection.status=="PAUSED"}
            Assert.assertEquals("Rotation must save the replacement before resume","",AndroidRuntime.state.value.error)
            compose.onNodeWithText("Resume contribution").performScrollTo().performClick()
            compose.waitUntil(30000){AndroidRuntime.state.value.connection.status=="AVAILABLE"}
            Assert.assertEquals(node,AndroidRuntime.state.value.connection.nodeId)
            compose.onNodeWithText("Pause contribution").performScrollTo().performClick()
            compose.waitUntil(10000){AndroidRuntime.state.value.connection.status=="PAUSED"}
            compose.activityRule.scenario.recreate()
            compose.activityRule.scenario.onActivity{it.window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)}
            compose.waitUntil(10000){AndroidRuntime.state.value.connection.status=="PAUSED"}
            compose.onNodeWithText("Resume contribution").performScrollTo().performClick()
            compose.waitUntil(30000){AndroidRuntime.state.value.connection.status=="AVAILABLE"}
            Assert.assertEquals(node,AndroidRuntime.state.value.connection.nodeId)
            compose.onNodeWithText("Disconnect").performScrollTo().performClick()
            compose.waitUntil(10000){AndroidRuntime.state.value.connection.status=="DISCONNECTED"}
            compose.onNodeWithText("Resume contribution").performScrollTo().performClick()
            compose.waitUntil(30000){AndroidRuntime.state.value.connection.status=="AVAILABLE"}
            compose.onNodeWithText("Leave network").performScrollTo().performClick()
            compose.waitUntil(30000){!AndroidRuntime.state.value.hasEnrollment}
            Assert.assertEquals("LEFT",AndroidRuntime.state.value.connection.status)
        } finally {
            compose.activityRule.scenario.onActivity{it.window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)}
            // Revokes only this test's newly created enrollment while its fixture is alive.
            if(AndroidRuntime.state.value.hasEnrollment)runBlocking{AndroidRuntime.leave()}
        }
    }
}
