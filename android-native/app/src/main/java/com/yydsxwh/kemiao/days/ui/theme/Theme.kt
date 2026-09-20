package com.yydsxwh.kemiao.days.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Brand = Color(0xFF2563EB)
val Pink = Color(0xFFFB7185)
val Fire = Color(0xFFFF6B35)
val Hot = Color(0xFFE11D48)
val Paper = Color(0xFFFFF5F7)
val Ink = Color(0xFF3B2340)

private val Light = lightColorScheme(
    primary = Brand,
    onPrimary = Color.White,
    secondary = Pink,
    onSecondary = Color.White,
    tertiary = Fire,
    background = Paper,
    onBackground = Ink,
    surface = Color.White,
    onSurface = Ink,
    error = Hot,
)

private val Dark = darkColorScheme(
    primary = Color(0xFF93C5FD),
    onPrimary = Color(0xFF0F172A),
    secondary = Pink,
    background = Color(0xFF1A1220),
    onBackground = Color(0xFFF8E7EE),
    surface = Color(0xFF24182C),
    onSurface = Color(0xFFF8E7EE),
    error = Pink,
)

@Composable
fun DaysTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (dark) Dark else Light, content = content)
}
