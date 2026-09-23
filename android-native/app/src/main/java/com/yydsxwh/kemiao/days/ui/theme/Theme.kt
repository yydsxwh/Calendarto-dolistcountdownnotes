package com.yydsxwh.kemiao.days.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color

/** 与网页版 `src/index.css` 同一套校园粉蓝。 */
val Brand = Color(0xFF2563EB)
val Pink = Color(0xFFFB7185)
val Fire = Color(0xFFFF6B35)
val Firelight = Color(0xFFFFB703)
val Hot = Color(0xFFE11D48)
val Paper = Color(0xFFFFF5F7)
val Ink = Color(0xFF3B2340)
val Muted = Color(0xFF9A7184)
val Powder = Color(0xFFDBEAFE)
val PinkSoft = Color(0xFFFFE4E6)
val Line = Color(0x1FE11D48)

private val Light = lightColorScheme(
    primary = Brand,
    onPrimary = Color.White,
    primaryContainer = Powder,
    onPrimaryContainer = Brand,
    secondary = Pink,
    onSecondary = Color.White,
    secondaryContainer = PinkSoft,
    onSecondaryContainer = Hot,
    tertiary = Fire,
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFFFEDD5),
    onTertiaryContainer = Color(0xFF9A3412),
    background = Paper,
    onBackground = Ink,
    surface = Color.White,
    onSurface = Ink,
    surfaceVariant = PinkSoft,
    onSurfaceVariant = Muted,
    surfaceTint = Color.Transparent,
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Paper,
    surfaceContainer = Color.White,
    surfaceContainerHigh = Color.White,
    surfaceContainerHighest = Color.White,
    outline = Line,
    outlineVariant = Line,
    error = Hot,
    errorContainer = PinkSoft,
    onError = Color.White,
    onErrorContainer = Hot,
)

private val Dark = darkColorScheme(
    primary = Color(0xFF93C5FD),
    onPrimary = Color(0xFF0F172A),
    primaryContainer = Color(0xFF1E3A8A),
    onPrimaryContainer = Color(0xFFDBEAFE),
    secondary = Pink,
    onSecondary = Color(0xFF3B0712),
    secondaryContainer = Color(0xFF4C1D2A),
    onSecondaryContainer = PinkSoft,
    tertiary = Firelight,
    background = Color(0xFF1A1220),
    onBackground = Color(0xFFF8E7EE),
    surface = Color(0xFF24182C),
    onSurface = Color(0xFFF8E7EE),
    surfaceVariant = Color(0xFF3B2340),
    onSurfaceVariant = Color(0xFFF9A8D4),
    surfaceTint = Color.Transparent,
    error = Pink,
)

@Composable
fun DaysTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (dark) Dark else Light, content = content)
}

/** 选中态用网页 `.tab.active` 的浅蓝底、品牌蓝字、粉色描边，不用 Material 默认紫。 */
@Composable
fun CampusFilterChip(
    selected: Boolean,
    onClick: () -> Unit,
    label: @Composable () -> Unit,
    modifier: Modifier = Modifier,
) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = label,
        modifier = modifier,
        colors = FilterChipDefaults.filterChipColors(
            containerColor = Color.White,
            labelColor = Muted,
            selectedContainerColor = Powder,
            selectedLabelColor = Brand,
        ),
        border = FilterChipDefaults.filterChipBorder(
            enabled = true,
            selected = selected,
            borderColor = Line,
            selectedBorderColor = Color(0x73FB7185),
        ),
    )
}
