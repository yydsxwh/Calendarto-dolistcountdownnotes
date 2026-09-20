# 颗秒日事 · 现有功能清单（Existing Features）

> **这份文档是「不可删除清单」。**
> 下面列出的每一项都是仓库里**实际存在**的用户功能或用户数据。
> 在得到产品负责人明确批准之前，一律不得删除、不得让入口消失、不得让旧数据读不出来。
>
> 生成方式：全量扫描 `src/`、`server/`、`android/`、`ios`（未生成）、`desktop/`、
> `scripts/`、`.github/`，逐个文件核对，而不是照着需求文档反推。
>
> 最后核对时间：2026-09-19，对应 commit `64898f1`。

---

## 0. 先说三条与常见假设不符的事实

盘点过程中发现三处「以为有、其实没有」，写在最前面，避免后续开发误以为它们已经存在：

| 常被认为存在的功能 | 实际情况 | 标记 |
| --- | --- | --- |
| **笔记**（长文 Notes） | **不存在。** 仓库里只有 `便签`（`Notes.tsx` 渲染的是彩色便利贴）。便签 UI 自己写着「需要长文请用站点里的网页文档」。 | `NEEDS_OWNER_CONFIRMATION` |
| **纪念日** | **没有独立功能。** 只有倒数日的 `repeatYearly` 布尔字段，能做到「每年重复」，但**没有周年数计算**（1 周年 / 10 周年）、没有独立入口、没有提前提醒。 | `NEEDS_OWNER_CONFIRMATION` |
| **今日提醒**（每日例行事务） | **没有这个实体。** 有的是「我的一天」聚合视图 + 一套提醒引擎。**不存在**「每日重复的例行任务」这种数据类型——待办没有重复字段。 | `NEEDS_OWNER_CONFIRMATION` |

反过来，有两个功能在需求描述里没被提到，但**确实存在且必须保留**：

- **考试时间表**（独立标签页 + 独立数据模型 + 导入 + 提醒）
- **自我管理时间表 / 自律**（独立标签页 + 独立数据模型 + 提醒）

---

## 1. 技术底座

| 项目 | 现状 |
| --- | --- |
| 框架 | React 18 + TypeScript 5.6，Vite 5 打包 |
| 路由 | **hash 路由**，`window.location.hash`，见 `src/App.tsx` |
| 状态 | 单一 `useAppStore` hook，一个 `AppData` 对象 |
| 持久化 | 浏览器 `localStorage` |
| 服务端 | `server/`（BFF，本轮之前不存在，见 PR #13） |
| 数据库 | SQLite，仅存放同步文档与账号映射 |
| 客户端外壳 | Capacitor Android / iOS、Electron Windows |

### 1.1 路由清单（全部必须保持可用）

| Hash | 视图 | 标签名 | 组件 |
| --- | --- | --- | --- |
| `#today` | 我的一天 | 我的一天 | `Today.tsx` |
| `#calendar` | 日历 | 日历 | `CalendarView.tsx` |
| `#todos` | 待办 | 待办 | `Todos.tsx` |
| `#schedule` | 课程表 | 课表 | `Schedule.tsx` |
| `#exams` | 考试时间表 | 考试 | `ExamTimetable.tsx` |
| `#selfschedule` | 自我管理时间表 | 自律 | `SelfManagementTimetable.tsx` |
| `#days` | 倒数日 | 倒数日 | `Countdowns.tsx` |
| `#notes` | 便签 | 便签 | `Notes.tsx` |

非法 hash 回落到 `today`。**这 8 个 hash 都是用户可能收藏过的 URL，不得失效。**

### 1.2 localStorage 键清单（全部是用户数据，不得清除）

| 键 | 内容 | 写入位置 |
| --- | --- | --- |
| `kemiao-days-v1` | **主数据**：全部业务数据（`AppData`） | `src/lib/store.ts` |
| `kemiao-days-fired-reminders` | 已触发提醒去重表，8 天滚动清理 | `src/lib/reminders.ts` |
| `kemiao-days-session-token` | 原生外壳的日事会话令牌 | `src/lib/cloud-sync.ts` |
| `kemiao-days-sync-checkpoint` | 本机与云端的同步位点 | `src/lib/cloud-sync.ts` |

---

## 2. 数据模型（`src/types.ts`）

`AppData` 是唯一的顶层文档：

```ts
interface AppData {
  todos: Todo[]
  countdowns: Countdown[]
  notes: Note[]
  courses: Course[]
  exams: Exam[]
  selfSchedules: SelfScheduleItem[]
  calendarEvents: CalendarEvent[]
  reminderSettings: ReminderSettings
  terms: Term[]
  currentTermId?: string
  timetableView: TimetableViewSettings
  termStart?: string          // 旧字段，仍被 hydrate 读取
}
```

**所有字段都必须继续可读。** `hydrateAppData()` 已经承担向后兼容职责：缺字段补默认值、
`termStart` 旧数据回填成 `terms[0]`、`remindMinutes` 缺失补 15。新增字段时必须沿用这个模式。

| 实体 | 关键字段 |
| --- | --- |
| `Todo` | id, title, done, dueDate?, dueTime?, priority, remindMinutes, createdAt |
| `Countdown` | id, title, date, color, emoji, **repeatYearly**, createdAt |
| `Note` | id, title, body, color, **pinned**, date?, updatedAt |
| `Course` | id, name, weekday, startTime, endTime, location?, teacher?, **weeks?**, color, remindMinutes, createdAt, **termId?**, note? |
| `Exam` | id, name, **kind**(midterm/final/makeup/other), date, startTime, endTime?, location?, seat?, remindMinutes, createdAt |
| `SelfScheduleItem` | id, title, weekday, startTime, endTime, color, note?, remindMinutes, priority, createdAt |
| `CalendarEvent` | id, title, date, startTime?, endTime?, allDay, location?, note?, color, priority, remindMinutes, **repeat**(none/daily/weekly/monthly/yearly), createdAt |
| `Term` | id, yearStart, **kind**(fall/spring/summer/winter/practice/intern), title?, startDate, weekCount |
| `TimetableViewSettings` | weekStartsOn(1\|7), showOffWeekCourses, hiddenHours[], hiddenWeekdays[], classPeriods[] |
| `ReminderSettings` | enabled, classDefaultMinutes(15), examDefaultMinutes(1440), eventDefaultMinutes(15), todoDefaultMinutes(15), selfScheduleDefaultMinutes(10), examAlsoHourBefore(true) |

---

## 3. 逐功能清单

### 3.1 我的一天（`#today`）

**状态：工作正常。**

聚合展示，本身不产生数据：问候语（按小时切换早上好/下午好/晚上好）、最近倒数日大卡片、
今天的课（按学期 + 教学周过滤）、考试时间表（未来 4 场）、今天要做（逾期 / 今日 / 未定期）、
倒数日前 3、钉住的便签前 4。可直接勾选待办。

依赖：`upcomingClasses`、`upcomingExams`、`courseInTerm`、`courseInTeachingWeek`、`teachingWeekNumber`、`nextOccurrence`。

> 这是**唯一**可以对应「今日提醒」概念的现有功能，但它是**聚合视图**，不是可创建的例行任务。

### 3.2 日历（`#calendar`）

**状态：工作正常。**

月视图（`monthCells`）、上月/下月/回到今天、点选日期、四色圆点（待办 / 倒数日 / 便签 / 考试）、
右侧当日面板（待办 / 倒数日 / 考试 / 便签，可勾选可删除）、快速添加（待办 / 倒数日 / 便签）。

**已知空缺**：月历圆点与当日面板**都不显示 `calendarEvents`**，见 3.9。

### 3.3 待办（`#todos`）

**状态：工作正常。**

创建（标题 + 到期日 + 具体时间 + 优先级 + 提醒提前量）、勾选完成、删除、
四个筛选页签（未完成 / 今天 / 即将到期 / 已完成）。
只有同时填了「日期 + 时间」才会产生定时通知。

`updateTodo` 在 store 里存在，但 UI 只用到勾选和删除，**没有编辑入口**。

### 3.4 课程表（`#schedule`）

**状态：工作正常，是功能最重的模块（`Schedule.tsx` 1003 行）。**

三个内部页签：**周课表 / 考试 / 提醒**。

- **周课表**：周网格（`WeekTimetable.tsx`），上一周/下一周/本周，教学周号显示，
  课程块按重叠自动分列（`layoutDayCourses`），点击查看详情，课程备注与调色板，
  空白处点击可新建课程。
- **时间轴**：左侧刻度跟随导入的上下课时钟（08:30 / 09:30 / 11:30），不是只有整点；
  可见范围裁剪到首节开始~末节结束（`buildTimeAxis`）。
- **隐藏行/列**：`hiddenHours` 默认隐藏 0–5 点，时间列头有 ▾ 展开（`hiddenHourRuns`）；
  `hiddenWeekdays` 可隐藏星期列。
- **单双周 / 教学周**：`parseWeekNumbers` 支持「1-16周」「1,3,5」「单周」「1-16单周」。
- **学期**：`Term` 系统（学年 + 第1/2学期 + 寒暑假小学期 + 社会实践 + 实习），
  `ScheduleSettings.tsx` 里可增删改切换，导入写入当前学期。
- **导入**：xls / xlsx / csv / ods（SheetJS）、课表照片 / 截图 / PDF / Word / 文本
  （`POST /api/days/timetable-ocr`，通义千问 `qwen-vl-max`）。照片先压到 JPEG ≤1600px；
  HEIC 拒绝并提示导出 JPG；识别结果有**人工核对界面**再入库。
- **节次推断**：`inferClassPeriods` 从打印的时钟推断节次，`hiddenHoursAroundCourses` 自动隐藏无课时段。

### 3.5 考试时间表（`#exams`）

**状态：工作正常。需求描述里没提到，但它是独立功能。**

横向星期 / 纵向 24 小时的时间网格，考试块按开始结束时间定位。
手工添加（名称 + 日期 + 起止时间 + 地点）、点击查看详情、删除、按周翻页。
导入图片 / 截图 / Excel / CSV（走同一套 OCR，提示词针对考试时间表）。
考试类型：期中 / 期末 / 补考 / 其他。

课程表内部也有一个考试页签，与这里共享同一份 `exams` 数据。

### 3.6 自我管理时间表 / 自律（`#selfschedule`）

**状态：工作正常。需求描述里没提到，但它是独立功能。**

面向大学生假期安排：学习 / 健身 / 兼职 / 休息 / 阅读。
横向星期 + 纵向 24 小时网格，添加（事情 + 星期 + 起止时间 + 备注）、点击详情、删除。
每条有 `priority` 和 `remindMinutes`，参与提醒引擎。

### 3.7 倒数日（`#days`）

**状态：工作正常。**

Days Matter 风格大数字卡片。创建（名称 + 日期 + emoji + 颜色 + **每年重复**）、删除。
显示「还有 N 天 / 就是今天 / 已过 N 天」，`nextOccurrence` 处理每年重复的下一次日期。

**已知空缺**：没有编辑入口（`updateCountdown` 在 store 里但 UI 没用）；
没有周年数（1 周年 / 10 周年）；没有提前提醒。

### 3.8 便签（`#notes`）

**状态：工作正常。**

彩色便利贴（6 色）。创建（标题 + 正文 + 颜色）、**就地编辑**（标题和正文直接改）、
钉住 / 取消钉住、删除。钉住的显示在「我的一天」。排序：钉住优先，再按 `updatedAt` 倒序。
可通过日历面板绑定到某一天（`note.date`）。

### 3.9 日历事件 `calendarEvents` —— 有数据模型，无 UI

**状态：`NEEDS_OWNER_CONFIRMATION`。**

- 类型 `CalendarEvent` 完整定义，含 `repeat`（none/daily/weekly/monthly/yearly）、
  `allDay`、`priority`、`remindMinutes`。
- store 有 `addCalendarEvent` / `updateCalendarEvent` / `removeCalendarEvent`。
- 提醒引擎**已经支持**它，`eventOccurrences()` 会展开 daily/weekly/monthly/yearly 重复。
- 全局搜索**能搜到**它。
- `itemsOnDate()` 也返回它。

**但是：没有任何界面能创建、编辑或删除日历事件。** 月历不画它，当日面板不列它。

也就是说：这是一套**已经写好、只差 UI** 的重复事件能力。
在新建 Recurrence Engine 之前必须先确认它的处置方式——这正是「不要造出两套同类系统」要防的情况。

**处置建议（待批准）**：把它作为新周期事件系统的载体，而不是另起炉灶。
**在批准前不删除、不改名、不改结构。**

### 3.10 Calendar Core —— 设计完成，完全未接线

**状态：`NEEDS_OWNER_CONFIRMATION`。**

`src/lib/calendar-core.ts` + `docs/CALENDAR_CORE.md` 定义了一整套领域模型：

`CalendarItem`（kind: event / task / day-plan / course / exam）、
`CalendarReminder`（多提醒 + 四级优先级）、
`CalendarRecurrence`（**frequency / interval / count / until / weekdays**）、
`CalendarProvider`（list / create / update / remove 接口）、
`queryCalendar()`、`overlaps()`、`recurrenceLabel()`。

文档明确写着是为「日事 + 未来约撘」准备的公共基础设施。

**`rg` 全仓扫描结果：没有任何文件 import 它。** 纯死代码，但**是有价值的死代码**——
它的 `CalendarRecurrence` 已经是 RRULE 的子集（`interval` / `count` / `until` / `weekdays`），
与需求第七节要的 Recurrence Engine 高度重合。

**处置建议（待批准）**：新 Recurrence Engine 在它基础上扩展，而不是平行再写一个。
**在批准前不删除。**

### 3.11 提醒引擎

**状态：工作正常，但有明确的架构局限。**

- 覆盖 5 类：课程 / 考试 / 待办 / 自我管理 / 日历事件。
- 默认提前量：上课 15 分、考试 1440 分（可再加 60 分）、日程 15 分、待办 15 分、自律 10 分。
- 网页：`setInterval` 每 30 秒轮询 + Notification API + 页内横幅。
- 原生：`@capacitor/local-notifications`，一次排 2 周内最多 96 条。
- 去重：`kemiao-days-fired-reminders`，键含时间戳，8 天滚动清理。

**局限（对应需求第十六节）**：网页端提醒**只在页面打开时**触发；
`collectDueReminders` 的触发窗口只有 90 秒，错过就不补发。这正是需要持久化 Reminder 的原因。

### 3.12 全局搜索

**状态：工作正常。**

顶栏搜索框，跨 7 类实体（日程 / 待办 / 课程 / 考试 / 自我管理 / 倒数日 / 便签）做
大小写不敏感的子串匹配，结果页替换主视图。

### 3.13 数据管理

**状态：工作正常。**

「更多」菜单下：导出备份（JSON，文件名带日期）、导入备份（`parseImport` 走 hydrate）、
清空本机数据（带 `confirm`）、返回软件产品。

### 3.14 统一账号与云同步

**状态：代码完成，真实联调 BLOCKED（见 PR #13 与 `docs/authentication.md`）。**

OIDC 登录、日事自有会话、整份 `AppData` 文档的按用户云同步、原生 Bearer 会话。

### 3.15 多端外壳

| 平台 | 状态 |
| --- | --- |
| 网页 | 生产运行，`https://www.yydsxwh.com/products/days/` |
| Android | Capacitor，`com.yydsxwh.kemiao.days`，CI 出 APK |
| iOS | Capacitor 配置齐全，CI 跑模拟器构建，`ios/` 目录按需生成 |
| Windows | Electron + electron-builder，CI 出 NSIS 安装包 |
| Huawei | **不存在。** 无 HMS、无 Push Kit 抽象 |

三个原生外壳都加载同一份 `dist/`。

---

## 4. 构建与发布（不得破坏）

| 命令 | 作用 |
| --- | --- |
| `npm run dev` / `dev:server` / `dev:mock-account` | 本地开发 |
| `npm run build` | `tsc -b && vite build` → `dist/`。**行为必须逐字保持** |
| `npm run build:server` | BFF → `dist-server/` |
| `npm run build:android` / `android:apk` | Android |
| `npm run build:ios` / `ios:simulator` | iOS |
| `npm run desktop:win` | Windows |
| `npm run lint` / `typecheck` / `test` / `test:timetable` | 检查 |
| `scripts/deploy-days.sh` | 发布静态包 + APK |

CI：`.github/workflows/deploy.yml`（web / windows / android / ios 四条线）、
`.github/workflows/ci.yml`（lint / typecheck / test / build）。

nginx `location ^~ /products/days/` 提供静态文件，Next 应用仍拥有 `/products`。

---

## 5. 生产数据现状

| 位置 | 有没有真实用户数据 |
| --- | --- |
| 浏览器 `localStorage` | **有。** 线上已发布，网页 / APK / exe 用户的数据都在自己设备上 |
| 服务端数据库 | **没有。** BFF 是本轮新增，尚未部署，没有任何生产数据 |

**这决定了迁移策略**：服务端可以自由建表，**没有历史包袱**；
真正需要小心的是**每一台用户设备上的 `localStorage`**——它是目前唯一的真实数据副本，
清缓存即丢失，且我们没有任何备份。

因此 `localStorage` → 云端的迁移必须：先上传、先校验、**本地副本保留**，确认云端完整后再谈清理。

---

## 6. 回归基线（Existing Feature Baseline）

Phase 1 为上述功能建立了 **102 个回归测试**，全部跑在 `npm test` 与 CI 里。
它们只有一个目的：**以后加新功能时，能立刻发现旧功能被弄坏了。**

| 文件 | 覆盖 | 用例数 |
| --- | --- | --- |
| `src/lib/store.regression.test.ts` | 数据模型、七类实体的创建默认值、**老数据向后兼容**、备份导出导入闭环 | 34 |
| `src/lib/reminders.regression.test.ts` | 五类提醒的触发时机、总开关、去重、原生排程上限、已知局限 | 22 |
| `src/lib/schedule.regression.test.ts` | 单双周、教学周、学期、时间轴、课程块排布、时间解析、倒数日日期计算、月历网格 | 46 |

其中最关键的是 `store.regression.test.ts` 的向后兼容一组：线上每位用户的数据只存在于
他自己浏览器的 `kemiao-days-v1` 里，我们没有服务端备份。这些用例逐条钉住
「老课程没有 `remindMinutes` 要补 15」「老的 `termStart` 要回填成学期」
「集合字段被写坏时回落成空数组」等规则，任何一条回归都意味着用户数据读不出来。

### 已知缺口（写测试时发现，均未修改代码）

| 缺口 | 现状 | 影响 |
| --- | --- | --- |
| `createCourse` 丢弃 `note` | 工厂函数没有透传 `note`，`Course` 类型里却有 | 目前不影响用户：课程备注走 `updateCourse` 写入。导入课程时无法带备注 |
| 待办没有编辑入口 | `updateTodo` 在 store 里，UI 只有勾选和删除 | 改标题或改到期日只能删了重建 |
| 倒数日没有编辑入口 | `updateCountdown` 在 store 里，UI 只有删除 | 同上 |
| 提醒触发窗口 90 秒 | `collectDueReminders` 只在 90 秒窗口内命中 | 页面在提醒时刻没打开就不补发。这正是需要持久化 Reminder 的原因 |

**以上四项都只是登记，本轮没有改动任何一行相关代码。**

---

## 7. 需要产品负责人确认的事项

| 编号 | 事项 | 为什么需要确认 |
| --- | --- | --- |
| `OWNER-1` | 「笔记」是**新功能**还是指便签？ | 仓库里没有长文笔记。若是新功能，要新建实体；若指便签，不要重复造 |
| `OWNER-2` | 「纪念日」是**新功能**还是指倒数日的每年重复？ | 现在只有 `repeatYearly`，没有周年数和提前提醒 |
| `OWNER-3` | 「今日提醒」是**新功能**还是指「我的一天」？ | 没有「每日例行任务」实体。需求描述的是可重复处理的事项，现有的是聚合视图 |
| `OWNER-4` | `calendarEvents` 是否补 UI，并作为新周期事件的载体？ | 已有完整模型 + 提醒支持，只差界面。不确认就可能造出第二套 |
| `OWNER-5` | `calendar-core.ts` 是否作为新 Recurrence Engine 的基础？ | 已设计好且与 RRULE 子集重合，但从未接线 |
| `OWNER-6` | 「自律」和「考试时间表」确认保留？ | 需求列表里没提到，按不可删除处理 |
| `OWNER-7` | 根目录 `components/WeekTimetable.tsx`、`main.tsx`、`crosshair.css` 可否删除？ | 早期 crosshair 尝试的遗留，`rg` 确认无人引用。**未批准前保留** |

**在以上事项得到答复之前，相关代码一律保持原样。**
