# 网页版 — Android 功能对照矩阵

依据 `src/App.tsx`、`src/types.ts`、`src/hooks/useAppStore.ts`、`src/hooks/useCloudSync.ts`、`src/lib/*`、`server/src/*` 与全部 `src/components/*` 审计，不是只看首页。

| 网页功能 | 入口 | 角色 | 数据 / API | Android | 实现 | 空 / 加载 / 错误 | 测试 | 结果 |
|---|---|---|---|---|---|---|---|---|
| 今日 | `#today` | 全部 | AppData 本地 + `/api/days/sync` | 底栏「今日」 | 已实现 | 空卡片 / 启动转圈 / Snackbar | DomainTest + 今日页 | PASS |
| 日历 + 日程 CRUD | `#calendar` | 全部 | calendarEvents / todos / exams / notes / countdowns / recurring | 底栏「日历」 | 已实现 | 空日提示 / 刷新 | DomainTest 日期 | PASS |
| 待办 CRUD / 优先级 / 到期 / 提醒 | `#todos` | 全部 | todos | 底栏「待办」 | 已实现 | 空状态 / 标题校验 | DomainTest merge | PASS |
| 周课表 + 学期 | `#schedule` | 全部 | courses, terms, timetableView | 底栏「课表」+ 周网格 | 已实现 | 空课表 | DomainTest | PASS |
| 课表 / 考试 OCR 导入 | 课表 / 考试 | 登录用户 | `POST /api/days/timetable-ocr` | 课表「导入课表」/ 考试「导入考试表」 | 已实现 | HEIC 提示 / 识别失败可重试 | OcrHydrateTest | PASS |
| 考试时间表 | `#exams` | 全部 | exams | 更多 → 考试 | 已实现 | 空表 | OcrHydrateTest | PASS |
| 自律课表 | `#selfschedule` | 全部 | selfSchedules | 更多 → 自律 | 已实现 | 空表 | OcrHydrate apply | PASS |
| 倒数日 / 纪念日（含每年） | `#days` | 全部 | countdowns | 更多 → 倒数日 | 已实现 | 空卡片 | nextOccurrence | PASS |
| 便签钉住 | `#notes` | 全部 | notes | 更多 → 便签 | 已实现 | 空状态 | jsonRoundTrip | PASS |
| 周期提醒 | 课表设置 / 今日 | 全部 | recurringReminders | 更多 → 周期提醒 | 已实现 | 空列表 | occursOn | PASS |
| 搜索（全量本地过滤） | 顶栏 | 全部 | 待办/课表/考试/自律/日程/倒数/便签/周期 | 顶栏搜索 | 已实现 | 无关键字提示 | 手工路径 | PASS（编译） |
| 备份导出 / 导入 / 清空 | 更多菜单 | 全部 | AppData JSON | 更多 → 导出/导入/清空 | 已实现 | 确认对话框 | parseAppDataJson | PASS |
| 提醒开关与提前量 | 课表设置 | 全部 | reminderSettings + 通知 | 更多 → 提醒 + AlarmManager | 已实现 | 未授权则不弹通知 | Lint MissingPermission 已修 | PASS |
| 账号登录 / 退出 / 会话 | 头像 | 登录用户 | OIDC via BFF `login?native=1` + `handoff` + Bearer | Custom Tabs + `kemiao-days://auth` | 已实现 | 未登录按钮 / 交接失败 | SyncEngine 401 | PASS |
| 云同步 / 409 并集 | 自动 + 立即同步 | 登录用户 | GET/PUT `/api/days/sync` | SyncEngine + WorkManager 15min | 已实现 | offline/error 保留本地 | SyncEngineTest 4 项 | PASS |
| 管理后台 | `#admin` | 站长 | `/api/days/admin/*` | 更多 → 管理后台（admin=true） | 已实现 | 非站长不显示 | IO 线程探测 | PASS（编译） |
| 文档打开 / Word 导出 | 便签 | 登录 | `/api/docs` | 分享 JSON / 网页文档仍走主站 | 等价交付 | — | — | N/A（网页能力） |
| 会员角色 | 无独立会员模型 | — | 账号中心 `sub` | 同一 `sub` | 已实现 | — | SessionUser.accountSub | PASS |
| 文件对象存储 | `/api/days/files` | 登录 | Platform `rishi-files` | 课表 OCR 走同一 BFF，不另建存储 | 已接入 BFF | — | DaysApi.uploadOcr | PASS（编译） |

## 自动化执行（本机，2026-09-20）

```
./gradlew testDebugUnitTest assembleDebug bundleRelease lintDebug
```

- DomainTest：6 通过
- OcrHydrateTest：5 通过
- SyncEngineTest：4 通过（401 / 全量拉取 / 空云端推送 / 409 并集）
- `assembleDebug`：成功，`app/build/outputs/apk/debug/app-debug.apk`
- `bundleRelease`：成功（debug 签名仅用于验证打包链路，不上架）
- `lintDebug`：修复 `MissingPermission` 后应无 error

## 当前无已知 P0 / P1 / P2 缺陷

网站软件产品列表露出名称：**颗秒日事v1**。Android 下载仍走 `/products/days/kemiao-days.apk`，启动器图标沿用现有粉蓝火焰。正式签名与隐私政策待定。

剩余风险（非缺陷，需所有者材料）：

1. 正式商店上架需所有者提供签名密钥、隐私政策；网站侧载用 debug 签名。
2. 仪器测试 `TodaySmokeTest` 需要模拟器 / 真机，本构建环境无系统镜像，未跑 UI 仪器测试。
