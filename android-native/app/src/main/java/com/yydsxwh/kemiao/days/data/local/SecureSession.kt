package com.yydsxwh.kemiao.days.data.local

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class SecureSession(context: Context) {
    private val prefs = EncryptedSharedPreferences.create(
        context,
        "rishi_secure_session",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    fun token(): String? = prefs.getString(KEY, null)?.takeIf { it.isNotBlank() }

    fun save(token: String) {
        prefs.edit().putString(KEY, token).apply()
    }

    fun clear() {
        prefs.edit().remove(KEY).apply()
    }

    companion object {
        private const val KEY = "rishi-session-token"
    }
}
