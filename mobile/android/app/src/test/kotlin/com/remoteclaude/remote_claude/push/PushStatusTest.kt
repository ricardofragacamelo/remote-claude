package com.remoteclaude.remote_claude.push

import org.junit.Assert.assertEquals
import org.junit.Test

class PushStatusTest {
    private fun resolve(
        transport: Boolean = true,
        runtimePermission: Boolean = true,
        granted: Boolean = true,
        enabled: Boolean = true,
        asked: Boolean = true,
    ) = PushStatus.resolve(transport, runtimePermission, granted, enabled, asked)

    @Test
    fun `without a transport everything is unavailable, never denied`() {
        assertEquals(PushStatus.UNAVAILABLE, resolve(transport = false))
        assertEquals(PushStatus.UNAVAILABLE, resolve(transport = false, granted = false, asked = false))
        assertEquals(PushStatus.UNAVAILABLE, resolve(transport = false, enabled = false))
    }

    @Test
    fun `granted when the permission is held and the settings allow it`() {
        assertEquals(PushStatus.GRANTED, resolve())
        assertEquals(PushStatus.GRANTED, resolve(runtimePermission = false, asked = false))
    }

    @Test
    fun `not asked is only possible where the permission is asked at runtime`() {
        assertEquals(PushStatus.NOT_ASKED, resolve(granted = false, asked = false))
    }

    @Test
    fun `refused after the prompt is denied`() {
        assertEquals(PushStatus.DENIED, resolve(granted = false, asked = true))
    }

    @Test
    fun `switched off in the settings is denied, even with the permission held`() {
        assertEquals(PushStatus.DENIED, resolve(enabled = false))
        assertEquals(PushStatus.DENIED, resolve(runtimePermission = false, enabled = false, asked = false))
    }

    @Test
    fun `the wire words are the ones the Dart side reads`() {
        assertEquals(
            listOf("notAsked", "granted", "denied", "unavailable"),
            PushStatus.entries.map { it.wire },
        )
    }
}
