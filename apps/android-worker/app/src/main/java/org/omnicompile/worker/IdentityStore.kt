package org.omnicompile.worker

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import kotlinx.serialization.json.*
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Keystore keys never leave the OS. Damaged ciphertext is never silently reset. */
class IdentityStore(context:Context,name:String="worker-identity") {
    private val preferences=context.getSharedPreferences(name,Context.MODE_PRIVATE)
    private val alias="org.omnicompile.worker.$name"
    private val keys=KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    private var damaged=false
    @Synchronized fun load():JsonObject? {
        val encrypted=preferences.getString("encrypted",null)?:return null
        return try {
            require(encrypted.length<=100000)
            val bytes=Base64.decode(encrypted,Base64.NO_WRAP);require(bytes.size>28)
            val key=keys.getKey(alias,null) as? SecretKey?:error("Identity encryption key is unavailable.")
            val cipher=Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE,key,GCMParameterSpec(128,bytes.copyOfRange(0,12)))
            Json.parseToJsonElement(String(cipher.doFinal(bytes.copyOfRange(12,bytes.size)),Charsets.UTF_8)).jsonObject
        } catch(_:Exception) { damaged=true; throw IllegalStateException("Protected enrollment cannot be read. Do not overwrite it; restore under this app installation or revoke it through the administrator.") }
    }
    @Synchronized fun save(value:JsonObject) {
        check(!damaged) { "Preserve damaged enrollment; explicit recovery is required." }
        val bytes=value.toString().toByteArray(Charsets.UTF_8);require(bytes.size<=65536)
        val key=(keys.getKey(alias,null) as? SecretKey)?:KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true).build())
        }.generateKey()
        val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key)
        check(preferences.edit().putString("encrypted",Base64.encodeToString(cipher.iv+cipher.doFinal(bytes),Base64.NO_WRAP)).commit()) { "Protected enrollment could not be saved." }
    }
    @Synchronized fun clear() { check(preferences.edit().remove("encrypted").commit()); damaged=false }
}
