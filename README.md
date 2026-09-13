# 颗秒日事

日历、待办、倒数日和便签一体的本地优先网页应用。属于「歪歪滴艾斯 / 颗秒」软件产品线，目标入口：

[https://www.yydsxwh.com/products](https://www.yydsxwh.com/products) → `/products/days`

## 产品做什么

参考滴答清单的待办排期、Days Matter 的大数字倒数、便利贴式便签，以及优效日历把事情画在月历上的做法，做成一个页面就能用的网页版。

- **今日**：问候、今天的课、考试时间表、待办、倒数日、钉住便签
- **日历**：月视图圆点（待办 / 倒数日 / 便签 / 考试）
- **待办**：到期日、高中低优先级、筛选
- **超级课程表**：周视图；导入 xls/xlsx/csv/ods 等表格，识别节次时间与时长；上课提醒
- **考试时间表**：期中 / 期末 / 补考，按日期时间提醒，减少记错错过
- **倒数日**：大数字卡片、颜色、表情、每年重复
- **便签**：彩色便利贴，可钉住、可搜索

数据存在浏览器 `localStorage`，无需登录。支持导出 / 导入 JSON 备份。换设备或清缓存会丢，云同步留给后续版本。

Windows 客户端和 Android 客户端后续再做；主站 Andyyyds 已有 Capacitor 封装可复用。

## 本地开发

```bash
npm install
npm run dev
```

打开 http://localhost:5173

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
