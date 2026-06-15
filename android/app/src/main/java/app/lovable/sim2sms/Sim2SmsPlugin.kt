package app.lovable.sim2sms

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SmsManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "Sim2Sms")
class Sim2SmsPlugin : Plugin() {

    @PluginMethod
    fun sendSms(call: PluginCall) {
        val phone = call.getString("phoneNumber")
        val message = call.getString("message")
        val simSlot = call.getInt("simSlot", 1) ?: 1

        if (phone.isNullOrBlank() || message.isNullOrBlank()) {
            call.reject("phoneNumber and message are required")
            return
        }

        if (ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.SEND_SMS), 1001)
            call.reject("SEND_SMS permission not granted yet — please tap Send again after allowing.")
            return
        }

        try {
            val sms: SmsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                val sm = context.getSystemService(SmsManager::class.java)
                val subId = resolveSubId(simSlot)
                if (subId != null) sm.createForSubscriptionId(subId) else sm
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }

            val parts = sms.divideMessage(message)
            if (parts.size > 1) {
                sms.sendMultipartTextMessage(phone, null, parts, null, null)
            } else {
                sms.sendTextMessage(phone, null, message, null, null)
            }

            val ret = JSObject()
            ret.put("success", true)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("SMS send failed: ${e.message}", e)
        }
    }

    private fun resolveSubId(simSlot: Int): Int? {
        return try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP_MR1) return null
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.READ_PHONE_STATE), 1002)
                return null
            }
            val sm = android.telephony.SubscriptionManager.from(context)
            val info = sm.getActiveSubscriptionInfoForSimSlotIndex(simSlot)
            info?.subscriptionId
        } catch (e: Exception) {
            null
        }
    }
}