package com.yydsxwh.kemiao.days.data.importing

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * 把 BFF 的错误码翻成用户能分辨的话。
 * 不把响应原文直接贴出来，避免把服务端内部信息或密钥碎片带进界面。
 */
fun userFacingOcrError(raw: String): String {
    val code = runCatching {
        Json.parseToJsonElement(raw).jsonObject["error"]?.jsonPrimitive?.contentOrNull
    }.getOrNull().orEmpty()
    return when (code) {
        "platform_unreachable" -> "Platform 未连接"
        "ai_unconfigured" -> "AI 尚未配置"
        "no_vision_model" -> "没有可用视觉模型"
        "service_token_invalid" -> "服务令牌错误"
        "login_required", "UNAUTHORIZED" -> "登录失效"
        "file_too_large" -> "文件过大"
        "unsupported_format", "legacy_doc" -> "格式不支持"
        "upstream_timeout" -> "上游超时"
        "no_result" -> "未识别到课程"
        "bad_model_output" -> "返回格式不合法"
        "recognition_failed" -> "识别没有成功完成，请重试一次"
        else -> when {
            raw.contains("登录", ignoreCase = false) -> "登录失效"
            raw.contains("TOO_LARGE") || raw.contains("413") -> "文件过大"
            raw.contains("timeout", ignoreCase = true) || raw.contains("aborted", ignoreCase = true) -> "上游超时"
            else -> "识别没有成功完成，请重试一次"
        }
    }
}
