package com.yydsxwh.kemiao.days.data.importing

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.pdf.PdfRenderer
import android.media.ExifInterface
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream

/** 和 BFF、nginx 的 OCR 上限保持同一个数，避免三处各写各的。 */
const val MAX_IMPORT_BYTES = 20 * 1024 * 1024
private const val MAX_IMAGE_EDGE = 1600
private const val MAX_PDF_PAGES = 6

class ImportTooLarge : Exception("file_too_large")
class ImportUnsupported(message: String) : Exception(message)

data class UploadPart(val fileName: String, val bytes: ByteArray, val mime: String)

data class StagedImport(val file: File, val displayName: String, val mime: String, val size: Long)

fun queryDisplayName(context: Context, uri: Uri): String? {
    val cursor = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)
    return cursor?.use { if (it.moveToFirst()) it.getString(0) else null }
}

/**
 * 按块拷进应用缓存，超过上限立刻停。
 * 不把整份原件一次性读进内存，登录往返之后仍能用这份缓存继续导入。
 */
fun stageImport(context: Context, uri: Uri): StagedImport {
    val resolver = context.contentResolver
    val mime = resolver.getType(uri).orEmpty()
    val name = queryDisplayName(context, uri) ?: "timetable"
    if (mime.contains("heic", true) || name.endsWith(".heic", true) || name.endsWith(".heif", true)) {
        throw ImportUnsupported("格式不支持")
    }
    val dir = File(context.cacheDir, "ocr-import").apply { mkdirs() }
    val dest = File(dir, "${System.currentTimeMillis()}-${name.replace(Regex("[^\\w.\\u4e00-\\u9fa5-]"), "_")}")
    resolver.openInputStream(uri).use { input ->
        if (input == null) throw ImportUnsupported("格式不支持")
        FileOutputStream(dest).use { output ->
            val buffer = ByteArray(16 * 1024)
            var total = 0
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                total += read
                if (total > MAX_IMPORT_BYTES) {
                    dest.delete()
                    throw ImportTooLarge()
                }
                output.write(buffer, 0, read)
            }
        }
    }
    return StagedImport(dest, name, mime, dest.length())
}

fun clearImportCache(context: Context) {
    File(context.cacheDir, "ocr-import").deleteRecursively()
}

/** 图片校正方向并压到长边 1600；PDF 逐页转成 JPEG；表格和 DOCX 原样交给 BFF。 */
fun prepareUploadParts(staged: StagedImport): List<UploadPart> {
    val name = staged.displayName
    val mime = staged.mime
    return when {
        isImage(name, mime) -> listOf(compressImage(staged.file, name))
        isPdf(name, mime) -> renderPdf(staged.file, name)
        isDocx(name, mime) || isSpreadsheet(name, mime) || isText(name, mime) -> {
            listOf(UploadPart(name, staged.file.readBytes(), mime.ifBlank { "application/octet-stream" }))
        }
        else -> throw ImportUnsupported("格式不支持")
    }
}

private fun isImage(name: String, mime: String) =
    mime.startsWith("image/") || name.endsWith(".jpg", true) || name.endsWith(".jpeg", true) || name.endsWith(".png", true) || name.endsWith(".webp", true)

private fun isPdf(name: String, mime: String) = mime == "application/pdf" || name.endsWith(".pdf", true)

private fun isDocx(name: String, mime: String) =
    name.endsWith(".docx", true) || mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

private fun isSpreadsheet(name: String, mime: String) =
    name.endsWith(".csv", true) || name.endsWith(".xls", true) || name.endsWith(".xlsx", true) ||
        mime.contains("spreadsheet") || mime.contains("excel") || mime == "text/csv"

private fun isText(name: String, mime: String) = mime.startsWith("text/") || name.endsWith(".txt", true)

private fun compressImage(file: File, name: String): UploadPart {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.absolutePath, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw ImportUnsupported("格式不支持")
    var sample = 1
    while (bounds.outWidth / sample > MAX_IMAGE_EDGE * 2 || bounds.outHeight / sample > MAX_IMAGE_EDGE * 2) sample *= 2
    val decoded = BitmapFactory.decodeFile(file.absolutePath, BitmapFactory.Options().apply { inSampleSize = sample })
        ?: throw ImportUnsupported("格式不支持")
    val oriented = applyExif(file, decoded)
    val edge = maxOf(oriented.width, oriented.height).coerceAtLeast(1)
    val scale = if (edge > MAX_IMAGE_EDGE) MAX_IMAGE_EDGE.toFloat() / edge else 1f
    val scaled = if (scale < 1f) {
        Bitmap.createScaledBitmap(oriented, (oriented.width * scale).toInt().coerceAtLeast(1), (oriented.height * scale).toInt().coerceAtLeast(1), true)
    } else oriented
    val bytes = ByteArrayOutputStream().use { stream ->
        scaled.compress(Bitmap.CompressFormat.JPEG, 85, stream)
        stream.toByteArray()
    }
    if (scaled !== oriented) scaled.recycle()
    if (oriented !== decoded) oriented.recycle()
    decoded.recycle()
    val jpegName = name.substringBeforeLast('.') + ".jpg"
    return UploadPart(jpegName, bytes, "image/jpeg")
}

private fun applyExif(file: File, bitmap: Bitmap): Bitmap {
    val orientation = runCatching {
        ExifInterface(file.absolutePath).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
    }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
    val degrees = when (orientation) {
        ExifInterface.ORIENTATION_ROTATE_90 -> 90f
        ExifInterface.ORIENTATION_ROTATE_180 -> 180f
        ExifInterface.ORIENTATION_ROTATE_270 -> 270f
        else -> return bitmap
    }
    val matrix = Matrix().apply { postRotate(degrees) }
    return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
}

private fun renderPdf(file: File, name: String): List<UploadPart> {
    val pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    PdfRenderer(pfd).use { renderer ->
        if (renderer.pageCount == 0) throw ImportUnsupported("格式不支持")
        val count = minOf(renderer.pageCount, MAX_PDF_PAGES)
        return (0 until count).map { index ->
            renderer.openPage(index).use { page ->
                val edge = maxOf(page.width, page.height).coerceAtLeast(1)
                val scale = MAX_IMAGE_EDGE.toFloat() / edge
                val width = (page.width * scale).toInt().coerceAtLeast(1)
                val height = (page.height * scale).toInt().coerceAtLeast(1)
                val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                val bytes = ByteArrayOutputStream().use { stream ->
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 85, stream)
                    stream.toByteArray()
                }
                bitmap.recycle()
                UploadPart("${name.substringBeforeLast('.')}-p${index + 1}.jpg", bytes, "image/jpeg")
            }
        }
    }
}
