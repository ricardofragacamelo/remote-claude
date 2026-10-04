package com.remoteclaude.remote_claude.push

/**
 * What crosses the push channel, with no Android in it — so it is tested on the JVM alone.
 *
 * The keys are the three the backend's payload is allowed to carry, plus its `kind`. Everything
 * else the supplier adds to a message (its own bookkeeping keys) is dropped here rather than
 * handed to Dart: the Dart side reads defensively, but it should not have to (S-19, S-20).
 *
 * One message is not about a request: [DEVICE_APPROVED], which carries the device and nothing else
 * (plan 17, F3). What a payload must carry depends on its kind.
 */
object PushPayload {
    const val KIND = "kind"
    const val SESSION_ID = "sessionId"
    const val REQUEST_ID = "requestId"
    const val EXPIRES_AT = "expiresAt"
    const val DEVICE_ID = "deviceId"

    /** What the payload calls a withdrawal — `withdrawalKind` on the Dart side. */
    const val WITHDRAWAL = "permissionResolved"

    /** What the payload calls the phone's own approval — `deviceApprovedKind` on the Dart side. */
    const val DEVICE_APPROVED = "deviceApproved"

    /** The event kinds the Dart side filters on — `PushEventKind`. */
    const val EVENT_TOKEN = "token"
    const val EVENT_ARRIVAL = "arrival"
    const val EVENT_OPENING = "opening"

    private val KEYS = listOf(KIND, SESSION_ID, REQUEST_ID, EXPIRES_AT)
    private val REQUIRED = listOf(SESSION_ID, REQUEST_ID, EXPIRES_AT)
    private val DEVICE_KEYS = listOf(KIND, DEVICE_ID)

    /** How much of a token may reach a log line: the last six characters, never the whole. */
    private const val TOKEN_TAIL = 6

    /**
     * The payload out of whatever the platform handed over, or `null` when it is not one of ours.
     *
     * An intent that started the app from the launcher carries no payload, and must not be read
     * as a tap on a notification.
     */
    fun of(source: Map<String, String?>): Map<String, String>? {
        val (keys, required) = if (source[KIND] == DEVICE_APPROVED) {
            DEVICE_KEYS to listOf(DEVICE_ID)
        } else {
            KEYS to REQUIRED
        }

        if (required.any { source[it].isNullOrBlank() }) {
            return null
        }

        return keys.mapNotNull { key -> source[key]?.let { key to it } }.toMap()
    }

    /** Whether this message tells the phone it was approved, rather than asking it anything. */
    fun isDeviceApproved(payload: Map<String, String>): Boolean = payload[KIND] == DEVICE_APPROVED

    /** Whether this message exists to take a notification down rather than show one. */
    fun isWithdrawal(payload: Map<String, String>): Boolean = payload[KIND] == WITHDRAWAL

    /**
     * The notification tag: the request, so a second delivery replaces the first (D-15) — or, for
     * the approval, the device, the same tag the backend gives it.
     */
    fun tagOf(payload: Map<String, String>): String =
        if (isDeviceApproved(payload)) "device:${payload.getValue(DEVICE_ID)}" else payload.getValue(REQUEST_ID)

    /** One event on the stream, in the shape `PlatformPushGateway` reads. */
    fun event(kind: String, data: Map<String, String>): Map<String, Any> =
        mapOf("kind" to kind, "data" to data)

    /** A token as a log line may show it. */
    fun tail(token: String?): String =
        if (token.isNullOrEmpty()) "none" else token.takeLast(TOKEN_TAIL)
}

/**
 * Where this installation stands with notifications, in the words `permissionFrom` reads.
 *
 * [UNAVAILABLE] is not [DENIED]: it is a build with no transport configured, which the user
 * cannot change from the system settings (D-21).
 */
enum class PushStatus(val wire: String) {
    NOT_ASKED("notAsked"),
    GRANTED("granted"),
    DENIED("denied"),
    UNAVAILABLE("unavailable");

    companion object {
        /**
         * @param transport whether a push transport is configured in this build at all
         * @param runtimePermission whether this Android version asks for the permission at runtime
         * @param granted whether the runtime permission is held (always true where there is none)
         * @param enabled whether the system settings let this app post notifications
         * @param asked whether this app has ever shown the permission prompt
         */
        fun resolve(
            transport: Boolean,
            runtimePermission: Boolean,
            granted: Boolean,
            enabled: Boolean,
            asked: Boolean,
        ): PushStatus = when {
            !transport -> UNAVAILABLE
            granted && enabled -> GRANTED
            runtimePermission && !granted && !asked -> NOT_ASKED
            else -> DENIED
        }
    }
}
