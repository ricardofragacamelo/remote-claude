package com.remoteclaude.remote_claude.push

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Where the supplier's library hands over what it received.
 *
 * With the app in the background the library shows a message that has words on its own, and
 * this service only runs for the silent ones — which are exactly the withdrawals, the one thing
 * that has to happen with nobody looking. In the foreground every message comes here, and the
 * notification is shown by [PushNotifications] with the same tag the library would have used.
 */
class PushMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        Log.d(TAG, "push.token.minted token=…${PushPayload.tail(token)}")
        PushEvents.emit(mapOf("kind" to PushPayload.EVENT_TOKEN, "token" to token))
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val payload = PushPayload.of(message.data)
        if (payload == null) {
            Log.d(TAG, "push.message.ignored reason=not-a-permission-payload")
            return
        }

        val withdrawal = PushPayload.isWithdrawal(payload)
        Log.d(TAG, "push.message.received withdrawal=$withdrawal")

        if (withdrawal) {
            PushNotifications.withdraw(this, PushPayload.tagOf(payload))
        } else {
            message.notification?.let { PushNotifications.show(this, payload, it.title, it.body) }
        }

        PushEvents.emit(PushPayload.event(PushPayload.EVENT_ARRIVAL, payload))
    }

    private companion object {
        const val TAG = "remote_claude.push"
    }
}
