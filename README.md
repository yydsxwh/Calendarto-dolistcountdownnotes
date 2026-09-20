# 颗秒日事

日历、待办、倒数日和便签一体的本地优先网页应用。属于「歪歪滴艾斯 / 颗秒」软件产品线，目标入口：

[https://www.yydsxwh.com/products](https://www.yydsxwh.com/products) → `/products/days`

## 产品做什么

参考滴答清单的待办排期、Days Matter 的大数字倒数、便利贴式便签，以及优效日历把事情画在月历上的做法，做成一个页面就能用的网页版。

- **今日**：问候、今天的课、考试时间表、待办、倒数日、钉住便签
- **日历**：月视图圆点（待办 / 倒数日 / 便签 / 考试）
- **待办**：到期日、高中低优先级、筛选
- **超级课程表**：周视图；导入 xls/xlsx/csv/ods，或把课表照片 / PDF / Word 交给站内 AI（与 MathCode 同一套视觉接口）识别课程、地点、时间、老师和时长；上课提醒
- **考试时间表**：期中 / 期末 / 补考，按日期时间提醒，减少记错错过
- **倒数日**：大数字卡片、颜色、表情、每年重复
- **便签**：彩色便利贴，可钉住、可搜索

数据存在浏览器 `localStorage`，无需登录也能用。登录账号中心后，网页和 Android 按同一个 OIDC `sub` 同步。

Android 客户端用 Capacitor 包同一套网页：`com.yydsxwh.kemiao.days`，青春校园粉蓝火焰主题，上课/考试走系统本地通知。

```bash
npm run build:android
npm run android:apk
```

生成 `android/app/build/outputs/apk/debug/app-debug.apk`。本机也可在 Android Studio 打开 `android/`。网页版仍走 `/products/days`。

## 本地开发

```bash
npm install
npm run dev:bff   # 127.0.0.1:3120，登录 / 同步 / OCR
npm run dev
```

打开 http://localhost:5173。未配置账号中心密钥时，离线功能仍可用。

```bash
npm run lint
npm run build
npx --yes tsx src/lib/timetable-import.selftest.ts
```

线上入口：

- 产品栏：https://www.yydsxwh.com/products
- 应用：https://www.yydsxwh.com/products/days/

发布静态包（本机需有 `~/.ssh/yyds_aliyun`，不要把私钥提交进仓库）：

```bash
./scripts/deploy-days.sh
```

主站产品卡片在服务器上的 Andyyyds 源码里（`packages/shared/src/software-products.ts`），改完后需要在 `/var/www/yyds-course-platform` 执行 `npm run build` 并 `pm2 restart yyds-course`。
