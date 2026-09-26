package com.remoteclaude.remote_claude.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PushPayloadTest {
    private val complete = mapOf(
        "kind" to "permissionRequested",
        "sessionId" to "s-1",
        "requestId" to "r-1",
        "expiresAt" to "2026-09-23T12:00:00Z",
    )

    @Test
    fun `keeps the four keys of a permission payload`() {
        assertEquals(complete, PushPayload.of(complete))
    }

    @Test
    fun `drops every key the supplier adds`() {
        val source = complete + mapOf("google.message_id" to "0:1", "from" to "123", "collapse_key" to "x")

        assertEquals(complete, PushPayload.of(source))
    }

    @Test
    fun `is not a payload when any required key is missing, null or blank`() {
        for (key in listOf("sessionId", "requestId", "expiresAt")) {
            assertNull(key, PushPayload.of(complete - key))
            assertNull(key, PushPayload.of(complete + (key to null)))
            assertNull(key, PushPayload.of(complete + (key to " ")))
        }
    }

    @Test
    fun `a launcher intent carries no payload`() {
        assertNull(PushPayload.of(emptyMap()))
    }

    @Test
    fun `kind is optional, and without it the message is not a withdrawal`() {
        val payload = PushPayload.of(complete - "kind")!!

        assertFalse(payload.containsKey("kind"))
        assertFalse(PushPayload.isWithdrawal(payload))
    }

    @Test
    fun `a withdrawal is the kind the backend sends when the permission resolves`() {
        assertTrue(PushPayload.isWithdrawal(complete + ("kind" to "permissionResolved")))
        assertFalse(PushPayload.isWithdrawal(complete))
    }

    @Test
    fun `the tag is the request`() {
        assertEquals("r-1", PushPayload.tagOf(complete))
    }

    @Test
    fun `an event has the shape the Dart gateway reads`() {
        assertEquals(
            mapOf("kind" to "opening", "data" to complete),
            PushPayload.event(PushPayload.EVENT_OPENING, complete),
        )
    }

    @Test
    fun `a token reaches a log line as its last six characters only`() {
        assertEquals("456789", PushPayload.tail("abc0123456789"))
        assertEquals("abc", PushPayload.tail("abc"))
        assertEquals("none", PushPayload.tail(""))
        assertEquals("none", PushPayload.tail(null))
    }
}
