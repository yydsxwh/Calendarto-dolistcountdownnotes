package com.yydsxwh.kemiao.days.data.importing

import org.junit.Assert.assertEquals
import org.junit.Test

class OcrErrorsTest {
    @Test
    fun mapsPlatformFailuresToDistinctCopy() {
        assertEquals("Platform 未连接", userFacingOcrError("""{"error":"platform_unreachable"}"""))
        assertEquals("AI 尚未配置", userFacingOcrError("""{"error":"ai_unconfigured"}"""))
        assertEquals("没有可用视觉模型", userFacingOcrError("""{"error":"no_vision_model"}"""))
        assertEquals("服务令牌错误", userFacingOcrError("""{"error":"service_token_invalid"}"""))
        assertEquals("登录失效", userFacingOcrError("""{"error":"login_required"}"""))
        assertEquals("文件过大", userFacingOcrError("""{"error":"file_too_large"}"""))
        assertEquals("格式不支持", userFacingOcrError("""{"error":"unsupported_format"}"""))
        assertEquals("上游超时", userFacingOcrError("""{"error":"upstream_timeout"}"""))
        assertEquals("未识别到课程", userFacingOcrError("""{"error":"no_result"}"""))
        assertEquals("返回格式不合法", userFacingOcrError("""{"error":"bad_model_output"}"""))
        assertEquals("识别没有成功完成，请重试一次", userFacingOcrError("""{"error":"recognition_failed"}"""))
        assertEquals("上游超时", userFacingOcrError("This operation was aborted"))
    }
}
