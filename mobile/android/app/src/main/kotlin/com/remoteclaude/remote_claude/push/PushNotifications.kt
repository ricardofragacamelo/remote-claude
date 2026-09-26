package com.remoteclaude.remote_claude.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.remoteclaude.remote_claude.MainActivity
import com.remoteclaude.remote_claude.R

/**
 * The notification side of the transport: the channel, showing one, and taking one down.
 *
 * The id is always `0` and the tag is the request. That is the pair the supplier's library uses
 * when it shows a tagged message on its own, so a withdrawal takes down the notification whether
 * this app or the library put it there.
 */
object PushNotifications {
    private const val TAG = "remote_claude.push"
    private const val ID = 0

    /** Creates the channel permission requests arrive on. Idempotent, as Android makes it. */
    fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }

        val channel = NotificationChannel(
            context.getString(R.string.push_channel_id),
            context.getString(R.string.push_channel_name),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply { description = context.getString(R.string.push_channel_description) }

        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    /**
     * Shows a permission request. The words come from the backend, already translated into the
     * device's locale — the operating system does not translate a notification (mobile/03).
     */
    fun show(context: Context, payload: Map<String, String>, title: String?, body: String?) {
        val manager = NotificationManagerCompat.from(context)
        if (!manager.areNotificationsEnabled()) {
            Log.d(TAG, "push.notification.skipped reason=disabled")
            return
        }

        val tag = PushPayload.tagOf(payload)
        val notification = NotificationCompat.Builder(context, context.getString(R.string.push_channel_id))
            .setSmallIcon(context.applicationInfo.icon)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(opening(context, payload, tag))
            .build()

        try {
            manager.notify(tag, ID, notification)
            Log.d(TAG, "push.notification.shown")
        } catch (error: SecurityException) {
            // The permission can be revoked between the check above and this line.
            Log.w(TAG, "push.notification.refused", error)
        }
    }

    /** Takes down whatever is showing for [tag]. Nothing showing is not an error. */
    fun withdraw(context: Context, tag: String) {
        NotificationManagerCompat.from(context).cancel(tag, ID)
        Log.d(TAG, "push.notification.withdrawn")
    }

    /** The tap: back into the activity, carrying the payload the way the library would. */
    private fun opening(context: Context, payload: Map<String, String>, tag: String): PendingIntent {
        val intent = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        payload.forEach { (key, value) -> intent.putExtra(key, value) }

        return PendingIntent.getActivity(
            context,
            tag.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}
