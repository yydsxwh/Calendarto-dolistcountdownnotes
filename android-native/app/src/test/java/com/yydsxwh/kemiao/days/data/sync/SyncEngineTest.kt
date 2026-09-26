package com.yydsxwh.kemiao.days.data.sync

import com.yydsxwh.kemiao.days.data.model.Todo
import com.yydsxwh.kemiao.days.data.model.emptyData
import com.yydsxwh.kemiao.days.data.remote.DaysApi
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncEngineTest {
    @Test
    fun unsignedUserStaysSignedOut() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"authenticated":false}"""))
        server.start()
        val api = DaysApi(origin = server.url("/").toString().trimEnd('/'), tokenProvider = { null })
        val result = SyncEngine(api).reconcile(emptyData(), 0)
        assertEquals(SyncState.SignedOut, result.state)
        server.shutdown()
    }

    @Test
    fun emptyLocalAdoptsRemote() = runBlocking {
        val server = MockWebServer()
        server.enqueue(
            MockResponse().setBody(
                """{"authenticated":true,"version":3,"updatedAt":"t","data":{"todos":[{"id":"a","title":"云端待办","done":false,"priority":"medium","remindMinutes":15,"createdAt":1}],"countdowns":[],"notes":[],"courses":[],"exams":[],"selfSchedules":[],"calendarEvents":[],"recurringReminders":[],"reminderSettings":{},"terms":[],"tombstones":[]}}""",
            ),
        )
        server.start()
        val api = DaysApi(origin = server.url("/").toString().trimEnd('/'), tokenProvider = { "tok" })
        val result = SyncEngine(api).reconcile(emptyData(), 0)
        assertEquals(SyncState.Synced, result.state)
        assertEquals(3L, result.version)
        assertEquals("云端待办", result.data?.todos?.single()?.title)
        server.shutdown()
    }

    @Test
    fun localContentPushesWhenRemoteEmpty() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody("""{"authenticated":true,"version":0,"data":null}"""))
        server.enqueue(MockResponse().setBody("""{"version":1,"updatedAt":"now"}"""))
        server.start()
        val api = DaysApi(origin = server.url("/").toString().trimEnd('/'), tokenProvider = { "tok" })
        val local = emptyData().copy(todos = listOf(Todo("1", "本机", false, null, null, null, "high", 15, 1)))
        val result = SyncEngine(api).reconcile(local, 0)
        assertEquals(SyncState.Synced, result.state)
        assertEquals(1L, result.version)
        assertTrue(server.takeRequest().path!!.endsWith("/api/days/sync"))
        server.shutdown()
    }

    @Test
    fun conflictMergesBothSides() = runBlocking {
        val server = MockWebServer()
        server.enqueue(
            MockResponse().setResponseCode(409).setBody(
                """{"version":4,"data":{"todos":[{"id":"cloud","title":"云端","done":false,"priority":"low","remindMinutes":15,"createdAt":2}],"countdowns":[],"notes":[],"courses":[],"exams":[],"selfSchedules":[],"calendarEvents":[],"recurringReminders":[],"reminderSettings":{},"terms":[],"tombstones":[]}}""",
            ),
        )
        server.enqueue(MockResponse().setBody("""{"version":5,"updatedAt":"now"}"""))
        server.start()
        val api = DaysApi(origin = server.url("/").toString().trimEnd('/'), tokenProvider = { "tok" })
        val local = emptyData().copy(todos = listOf(Todo("local", "本机", false, null, null, null, "high", 15, 3)))
        val result = SyncEngine(api).pushOnly(local, 3)
        assertEquals(SyncState.Synced, result.state)
        assertEquals(5L, result.version)
        assertEquals(2, result.data?.todos?.size)
        server.shutdown()
    }
}
