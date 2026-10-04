package com.remoteclaude.remote_claude.push

import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VisibleSessionTest {
    private fun question(sessionId: String) = mapOf(
        "kind" to "permissionRequested",
        "sessionId" to sessionId,
        "requestId" to "r-1",
        "expiresAt" to "2026-09-23T12:00:00Z",
    )

    @After
    fun reset() {
        VisibleSession.id = null
    }

    @Test
    fun `a question of the session on screen is left to its card`() {
        VisibleSession.id = "s-1"

        assertTrue(VisibleSession.hides(question("s-1")))
    }

    @Test
    fun `a question of another session still notifies`() {
        VisibleSession.id = "s-1"

        assertFalse(VisibleSession.hides(question("s-2")))
    }

    @Test
    fun `with no session on screen, every question notifies`() {
        assertFalse(VisibleSession.hides(question("s-1")))
    }
}
