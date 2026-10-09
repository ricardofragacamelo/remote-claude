package com.remoteclaude.remote_claude.save

import java.io.InputStream
import java.io.OutputStream

/**
 * What `remote_claude/save` is asked: the app's temporary file, the name to suggest and its type
 * (plan 25, B-26). Pure, so the JVM test reads it without a device.
 */
data class SaveRequest(val path: String, val name: String, val type: String) {
    companion object {
        /** The type a file of no known type is saved as. */
        const val ANY_TYPE = "application/octet-stream"

        /** The request in [arguments], or `null` when the path or the name is missing. */
        fun of(arguments: Map<String, Any?>?): SaveRequest? {
            val path = arguments?.get("path") as? String
            val name = (arguments?.get("name") as? String)?.let(::safeName)
            if (path.isNullOrEmpty() || name.isNullOrEmpty()) {
                return null
            }
            val type = (arguments["type"] as? String)?.takeIf { it.contains('/') } ?: ANY_TYPE
            return SaveRequest(path, name, type)
        }

        /** The last segment of [name], without what a file name cannot carry. */
        fun safeName(name: String): String =
            name.substringAfterLast('/').replace(Regex("[\\u0000-\\u001f\\\\:*?\"<>|]"), "_").trim()

        /** Copies [input] into [output] whole, and answers how many bytes went. */
        fun copy(input: InputStream, output: OutputStream): Long = input.use { from ->
            output.use { to -> from.copyTo(to) }
        }
    }
}
