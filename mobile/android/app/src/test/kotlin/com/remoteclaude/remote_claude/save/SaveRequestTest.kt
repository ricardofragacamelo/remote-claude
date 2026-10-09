package com.remoteclaude.remote_claude.save

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SaveRequestTest {
    @Test
    fun `reads the temporary, the name and the type the app sends`() {
        val request = SaveRequest.of(
            mapOf("path" to "/cache/d-1/report.pdf", "name" to "report.pdf", "type" to "application/pdf"),
        )

        assertEquals(SaveRequest("/cache/d-1/report.pdf", "report.pdf", "application/pdf"), request)
    }

    @Test
    fun `a missing path or name is no request`() {
        assertNull(SaveRequest.of(mapOf("name" to "a.txt")))
        assertNull(SaveRequest.of(mapOf("path" to "/cache/a")))
        assertNull(SaveRequest.of(mapOf("path" to "/cache/a", "name" to "")))
        assertNull(SaveRequest.of(null))
    }

    @Test
    fun `a type that is no type is saved as any type`() {
        val request = SaveRequest.of(mapOf("path" to "/cache/a", "name" to "a", "type" to "weird"))

        assertEquals(SaveRequest.ANY_TYPE, request?.type)
    }

    @Test
    fun `the name suggested is a name, not a path, and carries nothing a file name cannot`() {
        assertEquals("passwd", SaveRequest.safeName("../../etc/passwd"))
        assertEquals("a_b_c.txt", SaveRequest.safeName("a:b*c.txt"))
    }

    @Test
    fun `the temporary is copied into the chosen place whole`() {
        val bytes = ByteArray(300_000) { (it % 251).toByte() }
        val out = ByteArrayOutputStream()

        val copied = SaveRequest.copy(ByteArrayInputStream(bytes), out)

        assertEquals(300_000L, copied)
        assertArrayEquals(bytes, out.toByteArray())
    }
}
