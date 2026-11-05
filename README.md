# 上班鼓励器

一个小窗口，看见每一秒努力的价值。支持 macOS（Apple Silicon / Intel）与 Windows x64。

[下载安装包](https://github.com/2013358072/fuck-your-work/releases/latest) · [构建状态](https://github.com/2013358072/fuck-your-work/actions)

- 输入月薪与工作、休息时间，显示今日和本月累计税前正常工资。
- 周末默认休息，内置中国大陆 2026 年官方节假日及调休上班日；可手动覆盖任意日期。未收录年份会明确提示。
- 主动开始/结束加班，或事后补记；正常工作时间自动扣除。休眠和退出时结束计时，中断期间不擅自累计。
- 默认工作日 1.5 倍、休息日 2 倍、法定节日 3 倍，可自定义。连休中的非法定节日按休息日处理。
- 调休模式按实际加班小时 1:1 累计，余额长期保留，可登记使用。切换策略不改变历史记录。
- 窗口置顶、备份恢复、启动及每 6 小时检查 GitHub 新版本；发现更新后通知并提供对应平台下载。

## 安装

在 Releases 中选择对应文件：

| 系统 | 文件 |
| --- | --- |
| Mac Apple Silicon | `mac-arm64.dmg`（或 ZIP） |
| Mac Intel | `mac-x64.dmg`（或 ZIP） |
| Windows x64 | `windows-x64-setup.exe`；免安装选 `portable.exe` |

Mac 将应用拖入“应用程序”。Windows 安装版支持选择目录。

当前 v1.0.4 的 Mac 包使用临时签名，尚未取得 Developer ID 或经过 Apple 公证；Windows 包也没有可信发布者签名。它们不会被系统自动信任。重新打包或自签证书不能消除其他电脑上的身份验证提示。

### Mac 首次运行

若提示“Apple 无法验证是否包含恶意软件”，先确认应用来自本仓库 Releases，然后：

1. 关闭提示框，打开“系统设置 → 隐私与安全性”。
2. 滚动到“安全性”，找到“已阻止上班鼓励器”的提示。
3. 点击该应用旁的“仍要打开”，按系统要求用密码或触控 ID 确认，再点击“打开”。

这会为当前应用建立本机例外，不代表软件已通过 Apple 公证；新版本仍可能需要再次确认。无需关闭整个系统的 Gatekeeper。参见 [Apple 的单应用打开说明](https://support.apple.com/zh-cn/guide/mac-help/mh40617/mac)。

### Windows 首次运行

如果是“Windows 已保护你的电脑”的 SmartScreen 提示，在确认下载来源后点击“更多信息 → 仍要运行”。这属于本机允许运行，不会赋予文件可信发布者身份。

如果提示明确检出病毒、恶意软件，或 Smart App Control / 企业策略直接阻止运行，请记录完整提示和检测名称；这些情况不能用上述步骤等同处理，也不应关闭 Defender 或全局应用保护来运行。

### 面向其他用户的正式分发

Mac 需要 Apple Developer Program 会员签发的 Developer ID Application 证书、签名、公证和公证票据装订。Windows 可以使用可信代码签名服务/证书，或经审核通过 Microsoft Store 分发 MSIX。Windows 签名可以显示可信发布者，但新应用仍可能出现 SmartScreen 信誉提示，不能保证买证书后立即消失。参见 [Apple Developer ID](https://developer.apple.com/developer-id/)、[Microsoft SmartScreen 说明](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)。

## 计薪口径

正常工资 = 月薪 ÷ 本月应出勤日 ÷ 每日净工时 × 已过正常工作时长。每天的上下班与休息时间相同，暂不支持跨午夜班次。正常工资按完整自然月的排班估算，不含入离职、请假、个税、社保、奖金等调整。

加班工资 = 月薪 ÷ 月计薪天数（默认 21.75）÷ 每日净工时 × 加班小时 × 日期倍数。加班只在主动登记后累计；跨午夜按各日期拆分。补录按当前设置计算。软件金额为参考，实际结算以合同、考勤与工资单为准。

2026 日历依据：[国务院办公厅放假安排](https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm)、[法定节假日规定](https://www.gov.cn/zhengce/content/202411/content_6986380.htm)；日期数据参考 [holiday-cn](https://github.com/NateScarlet/holiday-cn)。

## 本地数据

优先使用程序所在目录的 `.work-encourager-data/settings.json`（Mac 在 `.app` 旁、Windows 便携版在 `.exe` 旁）。安装目录不可写时自动使用系统应用数据目录；已有回退数据时继续使用，避免更新后出现两份记录。设置页显示实际路径，可打开目录和导出/恢复完整备份。

不修改 `.app` 内部的签名资源；卸载前请先备份。Windows 安装程序在覆盖更新前自动备份安装目录数据，更新后恢复；卸载后也会在系统应用数据目录保留 `installer-backup` 恢复副本。每次保存使用临时文件替换并保留上一份 `.bak`。数据异常会保留原文件，并优先恢复备份。工资和记录不会上传；仅启用更新检查时访问 GitHub。

## 开发与发布

需要 Node.js 22 或更新版本。

```sh
npm ci
npm test
npm start
npm run dist:mac
npm run dist:win
```

推荐在对应系统上打包。更新 `package.json` 版本，提交并推送 `v版本号` 标签后，GitHub Actions 自动测试，在 macOS/Windows 分别构建安装包，全部成功后发布到 Releases。客户端自动检查新的正式 Release，下载和安装由用户主动完成。
