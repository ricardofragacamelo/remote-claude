package com.remoteclaude.remote_claude.push

/**
 * The session the app has on screen, as the Dart side says it (plan 10, D-10) — `null` when none is,
 * the app in the background included.
 *
 * A question of that session needs no notification: its card, the pill and the live region are
 * already in front of the person. A question of another session still notifies, and a withdrawal is
 * never skipped — taking a notification down is always safe.
 */
object VisibleSession {
    @Volatile
    var id: String? = null

    /** Whether showing [payload] is left to the screen that is already showing it. */
    fun hides(payload: Map<String, String>): Boolean {
        val visible = id
        return visible != null && payload[PushPayload.SESSION_ID] == visible
    }
}
