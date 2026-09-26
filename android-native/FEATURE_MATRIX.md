# 网页版 — Android 功能对照

底栏只有五项：我的一天、日历、时间表、日子、便签。待办在「我的一天」里增删改；时间表用课表 / 考试 / 自律 / 提醒切同一份数据。旧路由 `todos`、`schedule`、`exams`、`self`、`selfschedule`、`countdown`、`more` 会落到对应页面，不另存一份数据。

| 能力 | 网页 | Android | 数据 |
|---|---|---|---|
| 我的一天 | `#today` | 底栏「我的一天」，含今天的课、考试、待办、钉住便签 | 本地账号目录 + `/api/days/sync` |
| 待办 | `#todos` 会回到今日里的待办 | 同一页完整增删改、优先级、时间、提醒、搜索 | `todos` |
| 日历 | `#calendar` | 底栏「日历」 | 日程 / 待办 / 考试 / 便签 / 日子 |
| 时间表 | `#schedule` `#exams` `#selfschedule` | 底栏「时间表」+ 次级「课表 / 考试 / 自律 / 提醒」 | `courses` `exams` `selfSchedules` `terms` |
| 日子 | `#days` | 底栏「日子」（原倒数日 / 纪念日） | `countdowns` |
| 便签 | `#notes` | 底栏「便签」 | `notes` |
| 导入 | 表格本地解析；图片 / PDF / DOCX 走 BFF | SAF 选文件，预览确认后写入；未登录先登录再继续 | `POST /api/days/timetable-ocr` |
| 登录与同步 | 账号中心 OIDC，日事 Session | Custom Tabs，交接码换 token，放进 Android Keystore 存储 | `sub` 分账号 |
| 提醒 | 页签打开时 | AlarmManager | `reminderSettings` |
| 下载 | `/products/days/` | 正式包只来自 `android-native` release | 版本信息在 `kemiao-days-release.json` |

正式包 `versionName` 2.3.4、`versionCode` 17，包名 `com.yydsxwh.kemiao.days`，启动器名「颗秒日事」。Debug 包名带 `.debug`，名称是「颗秒日事调试」，不上传。没有 `website` 构建类型，Release 缺少正式 keystore 环境变量时直接失败。

布局测试用 Robolectric 断言星期栏和最后一节课的区域不压住底栏，覆盖 360×780、412×915、480×1040 dp、横屏、130% 字体和深色。这不是 Galaxy S25 Ultra 真机结果。
