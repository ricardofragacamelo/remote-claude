package com.remoteclaude.remote_claude

import android.content.Intent
import android.os.Bundle
import com.remoteclaude.remote_claude.push.PushChannel
import com.remoteclaude.remote_claude.push.PushEvents
import com.remoteclaude.remote_claude.push.PushNotifications
import com.remoteclaude.remote_claude.push.PushPayload
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel

// A `FragmentActivity`, not a plain one: the biometric prompt that guards an approval is a
// fragment, and the plugin that shows it refuses any other host (B-22).
class MainActivity : FlutterFragmentActivity() {
    private var push: PushChannel? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        PushNotifications.createChannel(this)

        // A recreated activity carries the intent it was started with; it is not a second tap.
        if (savedInstanceState == null) {
            opened(intent)
        }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        val messenger = flutterEngine.dartExecutor.binaryMessenger
        val channel = PushChannel(this)
        MethodChannel(messenger, "remote_claude/push").setMethodCallHandler(channel)
        EventChannel(messenger, "remote_claude/push/events").setStreamHandler(PushEvents)
        push = channel
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        opened(intent)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        push?.onPermissionResult(requestCode)
    }

    /** A tap on a notification, whether this app or the supplier's library showed it. */
    private fun opened(intent: Intent?) {
        val extras = intent?.extras ?: return
        val payload = PushPayload.of(extras.keySet().associateWith { extras.getString(it) }) ?: return

        PushEvents.emit(PushPayload.event(PushPayload.EVENT_OPENING, payload))
    }
}
