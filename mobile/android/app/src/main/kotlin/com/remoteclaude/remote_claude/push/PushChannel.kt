package com.remoteclaude.remote_claude.push

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * The platform's end of `remote_claude/push` — the methods `PlatformPushGateway` invokes.
 *
 * **Whether there is a transport at all** is read from the library: it initialises itself from
 * the credential file at build time, and a build without that file has no app to initialise.
 * Every method then answers what a build without transport answers — `unavailable`, no token —
 * and the Dart side already has words for that (D-21).
 */
class PushChannel(private val activity: Activity) : MethodChannel.MethodCallHandler {
    private var pendingRequest: MethodChannel.Result? = null

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        Log.d(TAG, "push.channel.call method=${call.method}")

        when (call.method) {
            "permission" -> result.success(status().wire)
            "request" -> request(result)
            "token" -> token(result)
            "withdraw" -> {
                call.argument<String>("tag")?.let { PushNotifications.withdraw(activity, it) }
                result.success(null)
            }
            "openSettings" -> {
                openSettings()
                result.success(null)
            }
            else -> result.notImplemented()
        }
    }

    /** Where the permission request landed. Called from the activity's permission callback. */
    fun onPermissionResult(requestCode: Int) {
        if (requestCode != REQUEST_CODE) {
            return
        }

        val status = status()
        Log.d(TAG, "push.permission.answered status=${status.wire}")
        pendingRequest?.success(status.wire)
        pendingRequest = null
    }

    private fun request(result: MethodChannel.Result) {
        val status = status()
        if (status != PushStatus.NOT_ASKED || !runtimePermission()) {
            // Android shows the prompt once; asking again after a refusal shows nothing, and the
            // UI offers the settings shortcut instead.
            result.success(status.wire)
            return
        }

        pendingRequest?.success(status.wire)
        pendingRequest = result
        preferences().edit().putBoolean(ASKED, true).apply()
        ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQUEST_CODE)
    }

    private fun token(result: MethodChannel.Result) {
        if (!transport()) {
            result.success(null)
            return
        }

        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            val token = if (task.isSuccessful) task.result else null
            if (token == null) {
                Log.w(TAG, "push.token.unavailable", task.exception)
            } else {
                Log.d(TAG, "push.token.read token=…${PushPayload.tail(token)}")
            }
            result.success(token)
        }
    }

    private fun openSettings() {
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)
        } else {
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.fromParts("package", activity.packageName, null))
        }

        activity.startActivity(intent)
    }

    private fun status(): PushStatus {
        val runtime = runtimePermission()

        return PushStatus.resolve(
            transport = transport(),
            runtimePermission = runtime,
            granted = !runtime || ContextCompat.checkSelfPermission(
                activity,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED,
            enabled = NotificationManagerCompat.from(activity).areNotificationsEnabled(),
            asked = preferences().getBoolean(ASKED, false),
        )
    }

    private fun transport(): Boolean = FirebaseApp.getApps(activity).isNotEmpty()

    private fun runtimePermission(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU

    private fun preferences() = activity.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    companion object {
        const val REQUEST_CODE = 4_170
        private const val TAG = "remote_claude.push"
        private const val PREFERENCES = "remote_claude.push"

        /** Android cannot say whether the prompt was ever shown, so this app remembers it. */
        private const val ASKED = "permission_asked"
    }
}
