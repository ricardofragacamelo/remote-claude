package com.remoteclaude.remote_claude.save

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.util.Log
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.File

/**
 * The platform's end of `remote_claude/save` — the system's "save as" (plan 25, B-26, D-14).
 *
 * `ACTION_CREATE_DOCUMENT` of the Storage Access Framework: the person chooses where, the app gets
 * a URI it may write, and no storage permission is ever asked. The temporary file is copied into
 * it; deleting the temporary is the Dart side's, in every outcome. The answer comes back through
 * the activity's `onActivityResult`, the way the push channel's permission answer does.
 */
class SaveChannel(private val activity: Activity) : MethodChannel.MethodCallHandler {
    private var pending: Pair<SaveRequest, MethodChannel.Result>? = null

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        Log.d(TAG, "save.channel.call method=${call.method}")

        if (call.method != "save") {
            result.notImplemented()
            return
        }
        @Suppress("UNCHECKED_CAST")
        val request = SaveRequest.of(call.arguments as? Map<String, Any?>)
        if (request == null) {
            result.error("SAVE_INVALID", "no file to save", null)
            return
        }
        if (pending != null) {
            result.error("SAVE_BUSY", "a save is already asking where", null)
            return
        }

        pending = request to result
        @Suppress("DEPRECATION")
        activity.startActivityForResult(
            Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType(request.type)
                .putExtra(Intent.EXTRA_TITLE, request.name),
            REQUEST_CODE,
        )
    }

    /** The answer of the dialog — ignored unless it is this channel's. */
    fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
        if (requestCode != REQUEST_CODE) {
            return false
        }
        val (request, result) = pending ?: return true
        pending = null

        val uri: Uri? = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) {
            Log.d(TAG, "save.channel.cancelled")
            result.success("cancelled")
            return true
        }
        try {
            val output = activity.contentResolver.openOutputStream(uri)
                ?: throw IllegalStateException("the chosen place cannot be written")
            val bytes = SaveRequest.copy(File(request.path).inputStream(), output)
            Log.d(TAG, "save.channel.saved bytes=$bytes")
            result.success("saved")
        } catch (error: Exception) {
            Log.w(TAG, "save.channel.failed ${error.javaClass.simpleName}")
            result.error("SAVE_FAILED", error.javaClass.simpleName, null)
        }
        return true
    }

    private companion object {
        const val TAG = "RemoteClaudeSave"

        /** Apart from the push channel's permission request. */
        const val REQUEST_CODE = 7301
    }
}
