# Calendar Core 公共基础设施

日事的日历从现在开始按公共基础设施设计，未来约撘及其他产品通过同一套 Calendar Core 接入，不重复实现日程、待办、提醒和重复规则。

## 核心对象
- Event：普通日程，可全天、可设地点/备注/分类/颜色
- Task：待办，可完成、设截止时间和优先级
- Day Plan：我的一天中的时间块
- Course / Exam：课程和考试，复用统一时间与提醒模型
- Reminder：一个事件可拥有多个提醒，并带紧急/重要/普通/低优先级
- Recurrence：不重复、每天、每周、每月、每年，并预留间隔、结束日期、次数、星期规则

## 产品接入
- 日事是第一方宿主产品。
- 未来约撘创建约定/活动时，应创建 sourceApp=yuetuo 的 CalendarItem，并保存 sourceId，支持活动取消、改期与日历同步。
- Calendar Core 不绑定具体 UI、数据库或第三方厂商，方便未来接入云同步、Android 原生日历、Apple Calendar 和 Web CalDAV 等适配器。

## 提醒原则
Web 使用浏览器 Notification / Service Worker 能力；Android 使用系统通知渠道、通知权限及精确闹钟能力。高优先级事项可以拥有多个提前提醒。

## 下一阶段
1. 把现有日程、待办、我的一天、课程、考试逐步迁移到 Calendar Core。
2. 增加月/周/日/年/时间轴视图和统一编辑器。
3. 增加重复事件的“仅本次 / 此后 / 全部”编辑规则。
4. 增加跨设备云同步和冲突解决。
5. 增加 Android/Apple 原生日历 Provider Adapter。
6. 对外提供稳定的 Calendar API，供约撘等产品调用。
