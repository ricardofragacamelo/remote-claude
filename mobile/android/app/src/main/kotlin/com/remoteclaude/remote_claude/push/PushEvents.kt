package com.remoteclaude.remote_claude.push

import android.os.Handler
import android.os.Looper
import android.util.Log
import io.flutter.plugin.common.EventChannel

/**
 * The platform's end of `remote_claude/push/events`.
 *
 * Events can happen before Dart listens: the tap that **started** the app arrives in `onCreate`,
 * long before the engine runs a line of Dart, and a token can be minted while the app is in the
 * background. Those are held here and delivered on the first listen — dropping the first one
 * would make the most important tap of all, the one from a cold start, open nothing.
 */
object PushEvents : EventChannel.StreamHandler {
    private const val TAG = "remote_claude.push"

    /** Enough for a burst while nobody listens; past that, the oldest go first. */
    private const val BACKLOG = 32

    private val main = Handler(Looper.getMainLooper())
    private val pending = ArrayDeque<Map<String, Any>>()
    private var sink: EventChannel.EventSink? = null

    /** Sends [event] to Dart, or keeps it until Dart listens. Safe from any thread. */
    fun emit(event: Map<String, Any>) {
        main.post {
            val current = sink
            if (current != null) {
                current.success(event)
                return@post
            }

            if (pending.size == BACKLOG) {
                pending.removeFirst()
            }
            pending.addLast(event)
            Log.d(TAG, "push.event.held kind=${event["kind"]} backlog=${pending.size}")
        }
    }

    override fun onListen(arguments: Any?, events: EventChannel.EventSink) {
        sink = events
        Log.d(TAG, "push.events.listen backlog=${pending.size}")
        while (pending.isNotEmpty()) {
            events.success(pending.removeFirst())
        }
    }

    override fun onCancel(arguments: Any?) {
        sink = null
        Log.d(TAG, "push.events.cancel")
    }
}
