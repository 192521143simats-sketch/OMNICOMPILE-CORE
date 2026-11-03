package org.omnicompile.worker

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Phase 9 explicitly supersedes Phase 8 system appearance.
@Suppress("UNUSED_PARAMETER")
internal fun workerColorScheme(dark: Boolean = true) = darkColorScheme(
    primary=Color(0xFFFF4D2E),onPrimary=Color(0xFF0C0D10),primaryContainer=Color(0xFF0C0D10),onPrimaryContainer=Color.White,
    secondary=Color(0xFFD9D9D9),onSecondary=Color(0xFF0C0D10),secondaryContainer=Color(0xFF0C0D10),onSecondaryContainer=Color.White,
    tertiary=Color(0xFFFF4D2E),onTertiary=Color(0xFF0C0D10),tertiaryContainer=Color(0xFF0C0D10),onTertiaryContainer=Color.White,
    background=Color(0xFF0C0D10),onBackground=Color.White,surface=Color(0xFF0C0D10),onSurface=Color.White,
    surfaceVariant=Color(0xFF0C0D10),onSurfaceVariant=Color(0xFFD9D9D9),surfaceTint=Color(0xFF0C0D10),
    error=Color(0xFFFF4D2E),onError=Color(0xFF0C0D10),errorContainer=Color(0xFF0C0D10),onErrorContainer=Color.White,
    outline=Color(0xFFD9D9D9),outlineVariant=Color(0xFFD9D9D9),inverseSurface=Color(0xFFD9D9D9),inverseOnSurface=Color(0xFF0C0D10),inversePrimary=Color(0xFFFF4D2E),
    surfaceDim=Color(0xFF0C0D10),surfaceBright=Color(0xFF0C0D10),surfaceContainerLowest=Color(0xFF0C0D10),surfaceContainerLow=Color(0xFF0C0D10),surfaceContainer=Color(0xFF0C0D10),surfaceContainerHigh=Color(0xFF0C0D10),surfaceContainerHighest=Color(0xFF0C0D10)
)

@Composable
fun WorkerTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme=workerColorScheme(),content=content)
}
